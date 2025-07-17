import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsDateString,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class BudgetBreakdownDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  item: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  cost: number;

  @ApiProperty()
  @IsString()
  description: string;
}

class ProposedBudgetDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ default: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ type: [BudgetBreakdownDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetBreakdownDto)
  breakdown: BudgetBreakdownDto[];
}

class MilestoneDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsDateString()
  deadline: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  deliverables: string[];

  @ApiProperty()
  @IsNumber()
  @Min(0)
  cost: number;
}

class ProposedTimelineDto {
  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiProperty({ type: [MilestoneDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones: MilestoneDto[];
}

class TeamMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  experience: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  linkedIn?: string;
}

class ProposedTeamDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  teamSize: number;

  @ApiProperty({ type: [TeamMemberDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMemberDto)
  teamMembers: TeamMemberDto[];
}

class TermsDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  guarantee?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  supportPeriod?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  revisionsIncluded?: number;

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  additionalServices?: string[];
}

export class CreateBidDto {
  @ApiProperty({ type: ProposedBudgetDto })
  @ValidateNested()
  @Type(() => ProposedBudgetDto)
  @IsNotEmpty()
  proposedBudget: ProposedBudgetDto;

  @ApiProperty({ type: ProposedTimelineDto })
  @ValidateNested()
  @Type(() => ProposedTimelineDto)
  @IsNotEmpty()
  proposedTimeline: ProposedTimelineDto;

  @ApiProperty({ description: 'Cover letter explaining why you are the best fit' })
  @IsString()
  @IsNotEmpty()
  coverLetter: string;

  @ApiProperty({ description: 'Detailed approach to solving the RFQ requirements' })
  @IsString()
  @IsNotEmpty()
  approach: string;

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  attachments?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  portfolioItems?: string[];

  @ApiProperty({ type: ProposedTeamDto, required: false })
  @ValidateNested()
  @Type(() => ProposedTeamDto)
  @IsOptional()
  proposedTeam?: ProposedTeamDto;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  deliverables: string[];

  @ApiProperty({ type: TermsDto, required: false })
  @ValidateNested()
  @Type(() => TermsDto)
  @IsOptional()
  terms?: TermsDto;
}