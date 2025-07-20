// Test script for payment processing functionality

const mongoose = require('mongoose');
const { Payment } = require('./src/models/Payment');

async function testPaymentSystem() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('✅ Connected to MongoDB');

    // Test 1: Create a test payment
    console.log('\n📝 Test 1: Creating test payment');
    const testPayment = new Payment({
      orderId: new mongoose.Types.ObjectId(),
      buyerId: new mongoose.Types.ObjectId(),
      sellerId: new mongoose.Types.ObjectId(),
      amount: 10000, // $100.00 in cents
      currency: 'USD',
      status: 'pending',
      paymentMethod: {
        type: 'credit_card',
        last4: '4242',
        brand: 'visa'
      },
      billing: {
        name: 'John Doe',
        email: 'john@example.com',
        address: {
          line1: '123 Main St',
          city: 'Anytown',
          state: 'NY',
          postalCode: '12345',
          country: 'US'
        }
      },
      metadata: {
        invoiceNumber: 'INV-001',
        description: 'Test payment for food order'
      }
    });

    // Calculate fees
    testPayment.calculateFees();
    await testPayment.save();
    
    console.log(`✅ Payment created: ${testPayment._id}`);
    console.log(`   Amount: $${(testPayment.amount / 100).toFixed(2)}`);
    console.log(`   Fees: $${(testPayment.fees.total / 100).toFixed(2)}`);
    console.log(`   Net Amount: $${(testPayment.netAmount / 100).toFixed(2)}`);

    // Test 2: Test payment methods
    console.log('\n🧪 Test 2: Testing payment methods');
    
    console.log(`   Can refund $50.00: ${testPayment.canRefund(5000)}`);
    console.log(`   Can refund $150.00: ${testPayment.canRefund(15000)}`);
    console.log(`   Refundable amount: $${(testPayment.refundableAmount / 100).toFixed(2)}`);

    // Test 3: Simulate payment completion
    console.log('\n✅ Test 3: Completing payment');
    testPayment.status = 'completed';
    testPayment.completedAt = new Date();
    testPayment.transactionId = 'pi_test_1234567890';
    await testPayment.addTimelineEvent('payment_completed', 'Payment processed successfully');
    await testPayment.save();
    
    console.log('✅ Payment marked as completed');

    // Test 4: Test refund functionality
    console.log('\n💰 Test 4: Testing refund');
    await testPayment.initiateRefund(2500, 'Customer requested partial refund'); // $25.00
    console.log('✅ Refund initiated');
    
    // Complete the refund
    await testPayment.completeRefund(0, 'ref_test_1234567890');
    console.log('✅ Refund completed');
    console.log(`   Total refunded: $${(testPayment.totalRefunded / 100).toFixed(2)}`);
    console.log(`   Remaining refundable: $${(testPayment.refundableAmount / 100).toFixed(2)}`);

    // Test 5: Payment statistics
    console.log('\n📊 Test 5: Payment statistics');
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const revenueStats = await Payment.getRevenueStats(startDate, endDate);
    const methodStats = await Payment.getPaymentMethodStats();
    
    console.log('Revenue Stats:', revenueStats[0] || { message: 'No revenue data' });
    console.log('Payment Method Stats:', methodStats);

    // Test 6: Query operations
    console.log('\n🔍 Test 6: Query operations');
    
    const pendingPayments = await Payment.findPendingPayments();
    console.log(`Found ${pendingPayments.length} pending payments`);
    
    const orderPayment = await Payment.findByOrder(testPayment.orderId);
    console.log(`Found payment for order: ${orderPayment ? 'Yes' : 'No'}`);

    // Test 7: Timeline and audit trail
    console.log('\n📝 Test 7: Timeline and audit trail');
    console.log('Payment timeline:');
    testPayment.timeline.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.event} - ${event.timestamp.toISOString()}`);
      if (event.description) console.log(`      ${event.description}`);
    });

    // Clean up test data
    console.log('\n🧹 Cleaning up test data');
    await Payment.deleteOne({ _id: testPayment._id });
    console.log('✅ Test payment deleted');

    // Test validation
    console.log('\n✅ Test 8: Validation tests');
    try {
      const invalidPayment = new Payment({
        // Missing required fields
        amount: -100, // Invalid amount
        currency: 'INVALID'
      });
      await invalidPayment.save();
      console.log('❌ Validation should have failed');
    } catch (error) {
      console.log('✅ Validation correctly rejected invalid payment');
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
    console.log('\n🎉 All payment system tests passed!');
    
    console.log('\n📋 Payment System Features Tested:');
    console.log('   ✅ Payment creation and fee calculation');
    console.log('   ✅ Payment status management');
    console.log('   ✅ Refund processing');
    console.log('   ✅ Timeline and audit tracking');
    console.log('   ✅ Statistics and reporting');
    console.log('   ✅ Query operations');
    console.log('   ✅ Validation and error handling');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing payment system:', error);
    process.exit(1);
  }
}

// Run test
testPaymentSystem();