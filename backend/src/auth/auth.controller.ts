import { Controller, Post, Body, Inject, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class RegisterDto {
  @IsEmail() email: string;
  @IsString() name: string;
  @IsString() @MinLength(6) password: string;
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.name, dto.password);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout — records an audit event (the JWT is stateless, dropped client-side)' })
  async logout(@CurrentUser() user: { id: string; email?: string }) {
    await this.authService.logout(user.id, user.email);
  }
}
