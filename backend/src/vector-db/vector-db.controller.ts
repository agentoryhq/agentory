import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, HttpCode,
  Logger, Optional, Inject, forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsBoolean, MaxLength, MinLength, IsIn, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { VectorDbService } from './vector-db.service';
import { VectorStoreProviderService } from './vector-store-provider.service';
import { EmbedService } from '../embed/embed.service';
import type { VectorDbProvider } from './vector-store.types';

// ── DTO ───────────────────────────────────────────────────────────────────────

const PROVIDERS: VectorDbProvider[] = ['qdrant', 'pgvector', 'chroma', 'astradb'];

class UpdateVectorDbConfigDto {
  @IsIn(PROVIDERS)
  provider: VectorDbProvider;

  @IsOptional() @IsString()
  url?: string | null;

  @IsOptional() @IsString()
  connectionString?: string | null;

  /**
   * API key / token in cleartext.
   *   - Non-empty string → encrypt and save
   *   - null             → clear
   *   - undefined        → keep unchanged
   */
  @IsOptional() @IsString()
  apiKey?: string | null;

  @IsOptional() @IsObject()
  extraConfig?: Record<string, any> | null;
}

class CreateCollectionDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  description?: string | null;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}

class UpdateCollectionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  description?: string | null;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/vector-db')
export class VectorDbController {
  private readonly logger = new Logger(VectorDbController.name);

  constructor(
    private readonly service:              VectorDbService,
    private readonly vectorStoreProvider:  VectorStoreProviderService,
    @Optional() @Inject(forwardRef(() => EmbedService))
    private readonly embedService:         EmbedService | null,
  ) {}

  // ── Config ─────────────────────────────────────────────────────────────────

  /** GET /api/admin/vector-db/config */
  @Get('config')
  @ApiOperation({ summary: 'Get Vector DB configuration' })
  getConfig() {
    return this.service.getConfig();
  }

  /** PATCH /api/admin/vector-db/config */
  @Patch('config')
  @ApiOperation({ summary: 'Update Vector DB configuration' })
  async updateConfig(@Body() dto: UpdateVectorDbConfigDto) {
    const result = await this.service.updateConfig({
      provider:         dto.provider,
      url:              dto.url,
      connectionString: dto.connectionString,
      apiKey:           dto.apiKey,
      extraConfig:      dto.extraConfig,
    });
    // Invalidate the provider cache
    this.vectorStoreProvider.invalidateCache();
    return result;
  }

  // ── Collections ─────────────────────────────────────────────────────────────

  /** GET /api/admin/vector-db/collections */
  @Get('collections')
  @ApiOperation({ summary: 'List collections' })
  listCollections() {
    return this.service.listCollections();
  }

  /** POST /api/admin/vector-db/collections */
  @Post('collections')
  @ApiOperation({ summary: 'Create new collection' })
  async createCollection(@Body() dto: CreateCollectionDto) {
    const created = await this.service.createCollection(dto);

    // Also create the collection physically in the vector store (best-effort).
    // If Qdrant is unreachable it does not block the response: it will be created
    // automatically on the first embed via ensureCollection().
    if (this.embedService) {
      try {
        await this.embedService.ensureCollection(created.name);
        this.logger.log(`Collection "${created.name}" created in Qdrant`);
      } catch (err) {
        this.logger.warn(
          `Collection "${created.name}" saved in the DB but not yet in Qdrant ` +
          `(will be created on the first embed): ${err.message}`,
        );
      }
    }

    return created;
  }

  /** PATCH /api/admin/vector-db/collections/:id */
  @Patch('collections/:id')
  @ApiOperation({ summary: 'Update collection' })
  updateCollection(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.service.updateCollection(id, dto);
  }

  /** POST /api/admin/vector-db/collections/:id/default */
  @Post('collections/:id/default')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set collection as default' })
  setDefault(@Param('id') id: string) {
    return this.service.setDefault(id);
  }

  /** DELETE /api/admin/vector-db/collections/:id */
  @Delete('collections/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete collection' })
  async deleteCollection(@Param('id') id: string) {
    await this.service.deleteCollection(id);
  }
}
