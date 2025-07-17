import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { RFQStatus } from '../models/rfq.model';

export class RFQFiltersDto {
  @ApiProperty({ required: false, enum: RFQStatus })
  @IsOptional()
  @IsEnum(RFQStatus)
  status?: RFQStatus;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  buyerId?: string;

  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 50;
}