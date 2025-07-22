import { AuthenticationError, UserInputError, ApolloError } from 'apollo-server-express';

import { Logger } from '../../core/logging/logger';
import { Proposal } from '../../models/Proposal';
import { RFQ } from '../../models/RFQ';
import { Context } from '../context';
import { pubsub } from '../context';

const logger = new Logger('ProposalResolvers');

export const proposalResolvers = {
  Query: {
    proposal: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const proposal = await Proposal.findById(id)
        .populate('supplier')
        .populate('rfq')
        .lean();

      if (!proposal) {
        throw new UserInputError('Proposal not found');
      }

      // Check access rights
      if (
        context.user.role === 'SELLER' &&
        proposal.supplier.toString() !== context.user.company.toString()
      ) {
        throw new AuthenticationError('Not authorized to view this proposal');
      }

      if (
        context.user.role === 'BUYER' &&
        proposal.rfq.buyer.toString() !== context.user.company.toString()
      ) {
        throw new AuthenticationError('Not authorized to view this proposal');
      }

      return proposal;
    },

    myProposals: async (_: any, { status }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      const query: any = { supplier: context.user.company };
      if (status) query.status = status;

      return Proposal.find(query)
        .populate('supplier')
        .populate('rfq')
        .sort('-createdAt')
        .lean();
    }
  },

  Mutation: {
    submitProposal: async (_: any, { input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        // Validate RFQ
        const rfq = await RFQ.findById(input.rfqId);
        if (!rfq) {
          throw new UserInputError('RFQ not found');
        }

        if (rfq.status !== 'published') {
          throw new UserInputError('RFQ is not active');
        }

        if (new Date() > rfq.expiresAt) {
          throw new UserInputError('RFQ has expired');
        }

        // Check if proposal already exists
        const existingProposal = await Proposal.findOne({
          rfq: input.rfqId,
          supplier: context.user.company
        });

        if (existingProposal) {
          throw new UserInputError('You have already submitted a proposal for this RFQ');
        }

        // Create proposal
        const proposal = new Proposal({
          rfq: input.rfqId,
          supplier: context.user.company,
          price: input.price,
          deliveryDate: input.deliveryDate,
          description: input.description,
          documents: input.documents || [],
          status: 'PENDING'
        });

        await proposal.save();
        await proposal.populate(['supplier', 'rfq']);

        // Notify buyer
        pubsub.publish('PROPOSAL_RECEIVED', {
          proposalReceived: proposal,
          buyerId: rfq.buyer
        });

        logger.info('Proposal submitted', {
          proposalId: proposal._id,
          rfqId: input.rfqId,
          userId: context.user.id
        });

        return proposal;
      } catch (error) {
        logger.error('Failed to submit proposal', error);
        throw error;
      }
    },

    updateProposal: async (_: any, { id, input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const proposal = await Proposal.findById(id);
        if (!proposal) {
          throw new UserInputError('Proposal not found');
        }

        if (proposal.supplier.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to update this proposal');
        }

        if (proposal.status !== 'PENDING') {
          throw new UserInputError(`Cannot update proposal with status: ${  proposal.status}`);
        }

        // Update proposal
        Object.assign(proposal, input);
        await proposal.save();

        logger.info('Proposal updated', {
          proposalId: id,
          userId: context.user.id
        });

        return proposal.populate(['supplier', 'rfq']);
      } catch (error) {
        logger.error('Failed to update proposal', error);
        throw error;
      }
    },

    withdrawProposal: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const proposal = await Proposal.findById(id);
        if (!proposal) {
          throw new UserInputError('Proposal not found');
        }

        if (proposal.supplier.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to withdraw this proposal');
        }

        if (proposal.status !== 'PENDING') {
          throw new UserInputError(`Cannot withdraw proposal with status: ${  proposal.status}`);
        }

        proposal.status = 'WITHDRAWN';
        await proposal.save();

        logger.info('Proposal withdrawn', {
          proposalId: id,
          userId: context.user.id
        });

        return true;
      } catch (error) {
        logger.error('Failed to withdraw proposal', error);
        throw error;
      }
    },

    acceptProposal: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const proposal = await Proposal.findById(id).populate('rfq');
        if (!proposal) {
          throw new UserInputError('Proposal not found');
        }

        if (proposal.rfq.buyer.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to accept this proposal');
        }

        if (proposal.status !== 'PENDING') {
          throw new UserInputError('Proposal is not pending');
        }

        // Accept this proposal
        proposal.status = 'ACCEPTED';
        await proposal.save();

        // Reject all other proposals for this RFQ
        await Proposal.updateMany(
          {
            rfq: proposal.rfq._id,
            _id: { $ne: proposal._id },
            status: 'PENDING'
          },
          { status: 'REJECTED' }
        );

        // Update RFQ status
        await RFQ.findByIdAndUpdate(proposal.rfq._id, {
          status: 'COMPLETED',
          selectedProposal: proposal._id
        });

        // Notify supplier
        pubsub.publish('PROPOSAL_ACCEPTED', {
          proposalAccepted: proposal,
          supplierId: proposal.supplier
        });

        logger.info('Proposal accepted', {
          proposalId: id,
          userId: context.user.id
        });

        return proposal;
      } catch (error) {
        logger.error('Failed to accept proposal', error);
        throw error;
      }
    },

    rejectProposal: async (_: any, { id, reason }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const proposal = await Proposal.findById(id).populate('rfq');
        if (!proposal) {
          throw new UserInputError('Proposal not found');
        }

        if (proposal.rfq.buyer.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to reject this proposal');
        }

        if (proposal.status !== 'PENDING') {
          throw new UserInputError('Proposal is not pending');
        }

        proposal.status = 'REJECTED';
        proposal.rejectionReason = reason;
        await proposal.save();

        logger.info('Proposal rejected', {
          proposalId: id,
          userId: context.user.id
        });

        return true;
      } catch (error) {
        logger.error('Failed to reject proposal', error);
        throw error;
      }
    }
  },

  Proposal: {
    supplier: async (proposal: any, _: any, context: Context) => {
      if (proposal.supplier?._id) return proposal.supplier;
      return context.dataloaders.companyLoader.load(proposal.supplier);
    },

    rfq: async (proposal: any, _: any, context: Context) => {
      if (proposal.rfq?._id) return proposal.rfq;
      return context.dataloaders.rfqLoader.load(proposal.rfq);
    }
  }
};
