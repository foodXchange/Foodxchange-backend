// utils/emailTemplates.js

const emailTemplates = {
  // Welcome email for new users
  welcome: (user) => ({
    subject: 'Welcome to FoodXchange!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <img src="https://foodxchange.com/logo.png" alt="FoodXchange" style="height: 50px;">
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">Welcome to FoodXchange, ${user.companyName}!</h2>
          <p>We're excited to have you join our global food sourcing platform.</p>
          
          ${user.userType === 'buyer' ? `
            <h3>As a buyer, you can:</h3>
            <ul>
              <li>Post sourcing projects</li>
              <li>Receive competitive proposals</li>
              <li>Connect with verified suppliers worldwide</li>
            </ul>
            <a href="https://foodxchange.com/projects/create" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Create Your First Project</a>
          ` : `
            <h3>As a vendor, you can:</h3>
            <ul>
              <li>Browse active sourcing projects</li>
              <li>Submit competitive proposals</li>
              <li>Grow your business globally</li>
            </ul>
            <a href="https://foodxchange.com/projects" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Browse Projects</a>
          `}
          
          <p style="margin-top: 30px;">If you have any questions, feel free to reach out to our support team.</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
          <p>&copy; 2024 FoodXchange. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Project invitation email
  projectInvitation: (vendor, project) => ({
    subject: `Invitation: ${project.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <img src="https://foodxchange.com/logo.png" alt="FoodXchange" style="height: 50px;">
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">You've Been Invited to Submit a Proposal</h2>
          <p>Hi ${vendor.companyName},</p>
          <p>You've been specially invited to submit a proposal for the following project:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">${project.title}</h3>
            <p><strong>Category:</strong> ${project.category}</p>
            <p><strong>Quantity:</strong> ${project.specifications.quantity.value} ${project.specifications.quantity.unit}</p>
            <p><strong>Location:</strong> ${project.specifications.delivery.location}</p>
            <p><strong>Deadline:</strong> ${new Date(project.deadline).toLocaleDateString()}</p>
          </div>
          
          <a href="https://foodxchange.com/projects/${project._id}" style="display: inline-block; background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Project Details</a>
          
          <p style="margin-top: 30px; color: #666;">This is an exclusive invitation. The project may not be visible to all vendors.</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
          <p>&copy; 2024 FoodXchange. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // New proposal notification for buyer
  proposalReceived: (buyer, project, proposal) => ({
    subject: `New Proposal: ${project.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <img src="https://foodxchange.com/logo.png" alt="FoodXchange" style="height: 50px;">
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">New Proposal Received</h2>
          <p>Hi ${buyer.companyName},</p>
          <p>You've received a new proposal for your project:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">${project.title}</h3>
            <p><strong>Vendor:</strong> ${proposal.vendor.companyName}</p>
            <p><strong>Total Price:</strong> ${proposal.pricing.currency} ${proposal.pricing.totalPrice.toLocaleString()}</p>
            <p><strong>Lead Time:</strong> ${proposal.delivery.leadTime} days</p>
          </div>
          
          <a href="https://foodxchange.com/projects/${project._id}/proposals" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Proposal</a>
          
          <p style="margin-top: 30px; color: #666;">You now have ${project.proposalCount} proposal(s) for this project.</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
          <p>&copy; 2024 FoodXchange. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Proposal accepted email
  proposalAccepted: (vendor, project, proposal) => ({
    subject: `🎉 Proposal Accepted: ${project.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #28a745; padding: 20px; text-align: center;">
          <img src="https://foodxchange.com/logo-white.png" alt="FoodXchange" style="height: 50px;">
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #28a745;">Congratulations! Your Proposal Has Been Accepted</h2>
          <p>Hi ${vendor.companyName},</p>
          <p>Great news! Your proposal has been accepted for:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">${project.title}</h3>
            <p><strong>Contract Value:</strong> ${proposal.pricing.currency} ${proposal.pricing.totalPrice.toLocaleString()}</p>
            <p><strong>Buyer:</strong> ${project.buyer.companyName}</p>
          </div>
          
          <h3>Next Steps:</h3>
          <ol>
            <li>The buyer will contact you shortly to finalize details</li>
            <li>Prepare necessary documentation</li>
            <li>Confirm delivery timeline</li>
          </ol>
          
          <a href="https://foodxchange.com/dashboard" style="display: inline-block; background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
          <p>&copy; 2024 FoodXchange. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Project expiring reminder
  projectExpiring: (user, project, daysLeft) => ({
    subject: `⏰ Project Expiring Soon: ${project.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffc107; padding: 20px; text-align: center;">
          <img src="https://foodxchange.com/logo.png" alt="FoodXchange" style="height: 50px;">
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">Project Deadline Approaching</h2>
          <p>Hi ${user.companyName},</p>
          <p>The following project expires in <strong>${daysLeft} days</strong>:</p>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin-top: 0;">${project.title}</h3>
            <p><strong>Deadline:</strong> ${new Date(project.deadline).toLocaleDateString()}</p>
            <p><strong>Proposals Received:</strong> ${project.proposalCount}</p>
          </div>
          
          ${user.userType === 'buyer' ? `
            <p>Don't forget to review proposals and make your selection before the deadline.</p>
            <a href="https://foodxchange.com/projects/${project._id}/proposals" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Proposals</a>
          ` : `
            <p>Make sure to submit or update your proposal before the deadline.</p>
            <a href="https://foodxchange.com/projects/${project._id}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Project</a>
          `}
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
          <p>&copy; 2024 FoodXchange. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Password reset email
  passwordReset: (user, resetToken) => ({
    subject: 'Password Reset Request - FoodXchange',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <img src="https://foodxchange.com/logo.png" alt="FoodXchange" style="height: 50px;">
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${user.companyName},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          
          <a href="https://foodxchange.com/reset-password?token=${resetToken}" style="display: inline-block; background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
          
          <p style="color: #666;">This link will expire in 1 hour for security reasons.</p>
          <p style="color: #666;">If you didn't request this password reset, please ignore this email.</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
          <p>&copy; 2024 FoodXchange. All rights reserved.</p>
        </div>
      </div>
    `
  })
};

module.exports = emailTemplates;