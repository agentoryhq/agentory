import { io, Socket } from 'socket.io-client'
import { McpProcess, McpServerConfig, McpTool } from './mcp-process'

type EmitFn = (channel: string, data: unknown) => void

export interface BridgeStatus {
  connected: boolean
  connecting: boolean
  serverUrl: string
  servers: ServerState[]
  uptime: number
  latency: number | null
}

export interface ServerState {
  id: string
  name: string
  status: 'starting' | 'running' | 'stopped' | 'error'
  pid?: number
  error?: string
  toolsCount: number
  tools: McpTool[]
}

interface ToolCallPayload {
  callId: string
  serverId: string
  tool: string
  args: Record<string, unknown>
}

interface ConfigPayload {
  servers: McpServerConfig[]
}

export class BridgeManager {
  private socket: Socket | null = null
  private processes = new Map<string, McpProcess>()
  private _connected = false
  private _connecting = false
  private _serverUrl = ''
  private connectedSince: number | null = null
  private latency: number | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private emit: EmitFn) {}

  getStatus(): BridgeStatus {
    const servers: ServerState[] = []
    for (const [id, proc] of this.processes) {
      servers.push({
        id,
        name: proc.config.name,
        status: proc.status,
        pid: proc.pid,
        toolsCount: proc.tools.length,
        tools: proc.tools
      })
    }

    return {
      connected: this._connected,
      connecting: this._connecting,
      serverUrl: this._serverUrl,
      servers,
      uptime: this.connectedSince ? Date.now() - this.connectedSince : 0,
      latency: this.latency
    }
  }

  private log(level: 'info' | 'success' | 'warn' | 'error', message: string): void {
    this.emit('log', { level, message, timestamp: Date.now() })
  }

  async connect(serverUrl: string, token: string): Promise<void> {
    if (this._connected || this._connecting) {
      await this.disconnect()
    }

    this._serverUrl = serverUrl
    this._connecting = true
    this.emitStatus()

    this.log('info', `Connecting to ${serverUrl}...`)

    this.socket = io(`${serverUrl}/mcp-bridge`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
      transports: ['websocket']
    })

    this.socket.on('connect', () => {
      this._connected = true
      this._connecting = false
      this.connectedSince = Date.now()
      this.emitStatus()
      this.log('success', `Connected to ${serverUrl}`)
      this.startLatencyPing()
    })

    this.socket.on('disconnect', (reason) => {
      this._connected = false
      this._connecting = true
      this.connectedSince = null
      this.latency = null
      this.emitStatus()
      this.log('warn', `Disconnected: ${reason}. Reconnecting...`)
    })

    this.socket.on('connect_error', (err) => {
      this._connecting = true
      this.emitStatus()
      this.log('error', `Connection error: ${err.message}`)
    })

    this.socket.on('reconnect', () => {
      this._connected = true
      this._connecting = false
      this.connectedSince = Date.now()
      this.emitStatus()
      this.log('success', 'Reconnected!')
    })

    // Server sends config with list of MCP servers to spawn
    this.socket.on('config', (payload: ConfigPayload) => {
      this.log('info', `Config received: ${payload.servers.length} servers`)
      this.handleConfig(payload)
    })

    // Server requests a tool call
    this.socket.on('tool:call', (payload: ToolCallPayload) => {
      this.handleToolCall(payload)
    })

    // Pong for latency
    this.socket.on('pong', (serverTime: number) => {
      this.latency = Date.now() - serverTime
      this.emitStatus()
    })
  }

  private startLatencyPing(): void {
    const ping = (): void => {
      if (this._connected && this.socket?.connected) {
        this.socket.emit('ping', Date.now())
        setTimeout(ping, 10000)
      }
    }
    setTimeout(ping, 2000)
  }

  private async handleConfig(payload: ConfigPayload): Promise<void> {
    const incoming = new Set(payload.servers.map(s => s.id))

    // Stop processes no longer in config
    for (const [id, proc] of this.processes) {
      if (!incoming.has(id)) {
        this.log('info', `Stopping removed server: ${proc.config.name}`)
        await proc.stop()
        this.processes.delete(id)
      }
    }

    // Start / update processes
    for (const serverConfig of payload.servers) {
      const existing = this.processes.get(serverConfig.id)
      if (existing) {
        // Server already active: restart only if command/args/env changed,
        // so a config change applies without restarting the bridge.
        if (configEquals(existing.config, serverConfig)) continue

        this.log('info', `[${serverConfig.name}] Config changed: restarting process`)
        await existing.stop()
        this.processes.delete(serverConfig.id)
      }

      this.spawnServer(serverConfig)
    }
  }

  /** Creates an McpProcess, attaches its listeners, and starts it. */
  private spawnServer(serverConfig: McpServerConfig): void {
    const proc = new McpProcess(serverConfig, (level, msg) => {
      this.log(level, msg)
    })

    proc.on('status', (statusEvent) => {
      this.socket?.emit('server:status', statusEvent)
      this.emitStatus()
    })

    proc.on('tools', (tools: McpTool[]) => {
      this.socket?.emit('tools:register', {
        serverId: serverConfig.id,
        tools
      })
      this.log('success', `[${serverConfig.name}] ${tools.length} tools registered`)
      this.emitStatus()
    })

    this.processes.set(serverConfig.id, proc)

    proc.start().catch((err: Error) => {
      this.log('error', `[${serverConfig.name}] Startup failed: ${err.message}`)
    })
  }

  private async handleToolCall(payload: ToolCallPayload): Promise<void> {
    const { callId, serverId, tool, args } = payload
    this.log('info', `Tool call: ${tool} on server ${serverId} (callId=${callId})`)

    const proc = this.processes.get(serverId)
    if (!proc) {
      this.socket?.emit('tool:result', {
        callId,
        error: `MCP server not found: ${serverId}`
      })
      return
    }

    if (proc.status !== 'running') {
      this.socket?.emit('tool:result', {
        callId,
        error: `MCP server not running: ${proc.status}`
      })
      return
    }

    try {
      const result = await proc.callTool(tool, args)
      this.log('success', `Tool ${tool} completed`)
      this.socket?.emit('tool:result', { callId, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log('error', `Tool ${tool} failed: ${message}`)
      this.socket?.emit('tool:result', { callId, error: message })
    }
  }

  private emitStatus(): void {
    this.emit('status-change', {
      connected: this._connected,
      connecting: this._connecting,
      serverUrl: this._serverUrl
    })
    this.emit('servers-update', this.getStatus().servers)
  }

  async disconnect(): Promise<void> {
    this._connected = false
    this._connecting = false

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Stop all MCP processes
    const stopPromises = Array.from(this.processes.values()).map(p => p.stop())
    await Promise.allSettled(stopPromises)
    this.processes.clear()

    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    this.connectedSince = null
    this.latency = null
    this.emitStatus()
    this.log('info', 'Disconnected')
  }
}

/**
 * Compares two MCP server configs to decide whether the process must be restarted.
 * Considers command, args and env (the id is already guaranteed equal; the name is
 * just a label and does not require a restart).
 */
function configEquals(a: McpServerConfig, b: McpServerConfig): boolean {
  if (a.command !== b.command) return false

  const argsA = a.args ?? []
  const argsB = b.args ?? []
  if (argsA.length !== argsB.length) return false
  if (argsA.some((v, i) => v !== argsB[i])) return false

  const envA = a.env ?? {}
  const envB = b.env ?? {}
  const keysA = Object.keys(envA)
  const keysB = Object.keys(envB)
  if (keysA.length !== keysB.length) return false
  return keysA.every(k => envA[k] === envB[k])
}
