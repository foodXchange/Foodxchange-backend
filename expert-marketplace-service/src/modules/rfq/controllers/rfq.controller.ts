import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RFQService } from '../services/rfq.service';
import { RFQMatchingService } from '../services/rfq-matching.service';
import { RFQBiddingService } from '../services/rfq-bidding.service';
import { RFQAnalyticsService } from '../services/rfq-analytics.service';
import { CreateBidDto } from '../dto/create-bid.dto';
import { UpdateBidDto } from '../dto/update-bid.dto';
import { RFQFiltersDto } from '../dto/rfq-filters.dto';
import { RespondToMatchDto } from '../dto/respond-to-match.dto';

@ApiTags('RFQ')
@Controller('rfq')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RFQController {
  constructor(
    private readonly rfqService: RFQService,
    private readonly matchingService: RFQMatchingService,
    private readonly biddingService: RFQBiddingService,
    private readonly analyticsService: RFQAnalyticsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all RFQs (filtered)' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'published', 'matched', 'in_progress', 'completed', 'cancelled'] })
  @ApiQuery({ name: 'categories', required: false, type: [String] })
  @ApiQuery({ name: 'buyerId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllRFQs(@Query() filters: RFQFiltersDto) {
    return this.rfqService.findAll(filters);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active RFQs for matching' })
  @Roles('expert')
  async getActiveRFQs() {
    return this.rfqService.getActiveRFQsForMatching();
  }

  @Get(':rfqId')
  @ApiOperation({ summary: 'Get RFQ details' })
  async getRFQDetails(@Param('rfqId') rfqId: string, @Req() req: any) {
    const rfq = await this.rfqService.findById(rfqId);
    
    // Track view if expert is viewing
    if (req.user.role === 'expert') {
      await this.rfqService.incrementViewCount(rfqId);
    }
    
    return rfq;
  }

  @Get(':rfqId/matches')
  @ApiOperation({ summary: 'Get matches for an RFQ' })
  @Roles('buyer', 'admin')
  async getRFQMatches(@Param('rfqId') rfqId: string) {
    return this.matchingService.getMatchesForRFQ(rfqId);
  }

  @Get(':rfqId/bids')
  @ApiOperation({ summary: 'Get bids for an RFQ' })
  async getRFQBids(@Param('rfqId') rfqId: string, @Req() req: any) {
    // Buyers can see all bids, experts can only see their own
    const bids = await this.biddingService.getBidsForRFQ(rfqId);
    
    if (req.user.role === 'expert') {
      return bids.filter(bid => bid.expertId.toString() === req.user.profileId);
    }
    
    return bids;
  }

  @Get(':rfqId/analytics')
  @ApiOperation({ summary: 'Get RFQ analytics' })
  @Roles('buyer', 'admin')
  async getRFQAnalytics(@Param('rfqId') rfqId: string) {
    return this.analyticsService.getRFQAnalytics(rfqId);
  }

  @Post(':rfqId/match-experts')
  @ApiOperation({ summary: 'Manually trigger expert matching for an RFQ' })
  @Roles('buyer', 'admin')
  @HttpCode(HttpStatus.OK)
  async matchExperts(@Param('rfqId') rfqId: string) {
    const matches = await this.matchingService.findMatchesForRFQ(rfqId);
    return {
      success: true,
      matchCount: matches.length,
      matches: matches.map(m => ({
        expertId: m.expertId,
        matchScore: m.matchScore,
        matchReasons: m.matchReasons,
      })),
    };
  }

  @Get('expert/matches')
  @ApiOperation({ summary: 'Get RFQ matches for the current expert' })
  @Roles('expert')
  async getExpertMatches(@Req() req: any) {
    return this.matchingService.getMatchesForExpert(req.user.profileId);
  }

  @Put('expert/matches/:matchId/respond')
  @ApiOperation({ summary: 'Respond to an RFQ match' })
  @Roles('expert')
  async respondToMatch(
    @Param('matchId') matchId: string,
    @Body() dto: RespondToMatchDto,
  ) {
    return this.matchingService.updateMatchStatus(
      matchId,
      dto.interested ? 'interested' : 'not_interested',
      dto.response,
    );
  }

  @Get('expert/bids')
  @ApiOperation({ summary: 'Get all bids for the current expert' })
  @Roles('expert')
  async getExpertBids(@Req() req: any) {
    return this.biddingService.getBidsForExpert(req.user.profileId);
  }

  @Post(':rfqId/bids')
  @ApiOperation({ summary: 'Create a new bid for an RFQ' })
  @Roles('expert')
  async createBid(
    @Param('rfqId') rfqId: string,
    @Body() dto: CreateBidDto,
    @Req() req: any,
  ) {
    return this.biddingService.createBid({
      rfqId,
      expertId: req.user.profileId,
      ...dto,
    });
  }

  @Put('bids/:bidId')
  @ApiOperation({ summary: 'Update a bid' })
  @Roles('expert')
  async updateBid(
    @Param('bidId') bidId: string,
    @Body() dto: UpdateBidDto,
    @Req() req: any,
  ) {
    return this.biddingService.updateBid(bidId, req.user.profileId, dto);
  }

  @Post('bids/:bidId/submit')
  @ApiOperation({ summary: 'Submit a draft bid' })
  @Roles('expert')
  @HttpCode(HttpStatus.OK)
  async submitBid(@Param('bidId') bidId: string) {
    return this.biddingService.submitBid(bidId);
  }

  @Post('bids/:bidId/withdraw')
  @ApiOperation({ summary: 'Withdraw a bid' })
  @Roles('expert')
  @HttpCode(HttpStatus.OK)
  async withdrawBid(@Param('bidId') bidId: string, @Req() req: any) {
    return this.biddingService.withdrawBid(bidId, req.user.profileId);
  }

  @Get('bids/:bidId')
  @ApiOperation({ summary: 'Get bid details' })
  async getBidDetails(@Param('bidId') bidId: string, @Req() req: any) {
    const bid = await this.biddingService.getBidById(bidId);
    
    // Ensure user can only see their own bid or if they're the buyer
    if (req.user.role === 'expert' && bid.expertId.toString() !== req.user.profileId) {
      throw new Error('Unauthorized');
    }
    
    return bid;
  }

  @Post('bids/:bidId/accept')
  @ApiOperation({ summary: 'Accept a bid' })
  @Roles('buyer')
  @HttpCode(HttpStatus.OK)
  async acceptBid(@Param('bidId') bidId: string) {
    return this.biddingService.acceptBid(bidId);
  }

  @Post('bids/:bidId/reject')
  @ApiOperation({ summary: 'Reject a bid' })
  @Roles('buyer')
  @HttpCode(HttpStatus.OK)
  async rejectBid(
    @Param('bidId') bidId: string,
    @Body('reason') reason: string,
  ) {
    return this.biddingService.rejectBid(bidId, reason);
  }

  @Get('analytics/overall')
  @ApiOperation({ summary: 'Get overall RFQ analytics' })
  @Roles('admin')
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  @ApiQuery({ name: 'status', required: false, type: [String] })
  @ApiQuery({ name: 'categories', required: false, type: [String] })
  async getOverallAnalytics(@Query() filters: any) {
    return this.analyticsService.getOverallAnalytics(filters);
  }
}