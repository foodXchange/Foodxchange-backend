import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, IsOptional } from 'class-validator';

export class RespondToMatchDto {
  @ApiProperty({ description: 'Whether the expert is interested in the RFQ' })
  @IsBoolean()
  interested: boolean;

  @ApiProperty({ description: 'Optional response message', required: false })
  @IsString()
  @IsOptional()
  response?: string;
}