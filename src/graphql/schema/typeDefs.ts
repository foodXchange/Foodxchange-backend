import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  scalar Date
  scalar Upload
  scalar JSON

  # Directives
  directive @auth(requires: Role = USER) on FIELD_DEFINITION
  directive @rateLimit(max: Int!, window: String!) on FIELD_DEFINITION
  directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION | ENUM_VALUE

  # Enums
  enum Role {
    ADMIN
    USER
    BUYER
    SELLER
    AGENT
  }

  enum OrderStatus {
    PENDING
    CONFIRMED
    PROCESSING
    SHIPPED
    DELIVERED
    CANCELLED
  }

  enum ProductStatus {
    DRAFT
    ACTIVE
    INACTIVE
    OUT_OF_STOCK
  }

  enum ComplianceStatus {
    PENDING
    APPROVED
    REJECTED
    EXPIRED
  }

  # Common Types
  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
    totalCount: Int!
  }

  # User Types
  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    role: Role!
    company: Company
    verified: Boolean!
    twoFactorEnabled: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  # Company Types
  type Company {
    id: ID!
    name: String!
    legalName: String!
    registrationNumber: String
    taxId: String
    address: Address!
    users: [User!]!
    products: ProductConnection
    verified: Boolean!
    compliance: ComplianceInfo
    createdAt: Date!
    updatedAt: Date!
  }

  type Address {
    street: String!
    city: String!
    state: String
    country: String!
    postalCode: String!
  }

  type ComplianceInfo {
    id: ID!
    status: ComplianceStatus!
    certifications: [Certification!]!
    lastAuditDate: Date
    nextAuditDate: Date
  }

  type Certification {
    id: ID!
    name: String!
    issuingBody: String!
    certificateNumber: String!
    issueDate: Date!
    expiryDate: Date!
    documentUrl: String
    verified: Boolean!
  }

  # Product Types
  type Product {
    id: ID!
    sku: String!
    name: String!
    description: String!
    category: Category!
    subcategory: String
    supplier: Company!
    price: Price!
    moq: Int!
    leadTime: Int!
    images: [String!]!
    specifications: JSON
    certifications: [Certification!]!
    status: ProductStatus!
    tags: [String!]!
    createdAt: Date!
    updatedAt: Date!
  }

  type Price {
    amount: Float!
    currency: String!
    unit: String!
    tiers: [PriceTier!]
  }

  type PriceTier {
    minQuantity: Int!
    maxQuantity: Int
    price: Float!
  }

  type Category {
    id: ID!
    name: String!
    slug: String!
    parent: Category
    children: [Category!]!
    productCount: Int!
  }

  # RFQ Types
  type RFQ {
    id: ID!
    buyer: Company!
    title: String!
    description: String!
    category: Category!
    products: [RFQProduct!]!
    requirements: String
    deliveryAddress: Address!
    deliveryDate: Date!
    budget: PriceRange
    status: String!
    proposals: [Proposal!]!
    createdAt: Date!
    expiresAt: Date!
  }

  type RFQProduct {
    product: Product
    productName: String!
    quantity: Int!
    specifications: JSON
  }

  type PriceRange {
    min: Float!
    max: Float!
    currency: String!
  }

  type Proposal {
    id: ID!
    rfq: RFQ!
    supplier: Company!
    items: [ProposalItem!]!
    totalPrice: Float!
    currency: String!
    validUntil: Date!
    terms: String
    status: String!
    createdAt: Date!
  }

  type ProposalItem {
    product: Product!
    quantity: Int!
    unitPrice: Float!
    totalPrice: Float!
    notes: String
  }

  # Order Types
  type Order {
    id: ID!
    orderNumber: String!
    buyer: Company!
    seller: Company!
    items: [OrderItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    total: Float!
    currency: String!
    status: OrderStatus!
    paymentStatus: String!
    shippingAddress: Address!
    billingAddress: Address!
    trackingInfo: TrackingInfo
    createdAt: Date!
    updatedAt: Date!
  }

  type OrderItem {
    product: Product!
    quantity: Int!
    unitPrice: Float!
    totalPrice: Float!
    status: String!
  }

  type TrackingInfo {
    carrier: String!
    trackingNumber: String!
    estimatedDelivery: Date
    currentStatus: String!
    events: [TrackingEvent!]!
  }

  type TrackingEvent {
    status: String!
    location: String
    timestamp: Date!
    description: String
  }

  # Analytics Types
  type Analytics {
    orders: OrderAnalytics!
    products: ProductAnalytics!
    revenue: RevenueAnalytics!
    users: UserAnalytics!
  }

  type OrderAnalytics {
    totalOrders: Int!
    pendingOrders: Int!
    completedOrders: Int!
    averageOrderValue: Float!
    ordersByStatus: [StatusCount!]!
  }

  type ProductAnalytics {
    totalProducts: Int!
    activeProducts: Int!
    topProducts: [ProductPerformance!]!
    categoriesDistribution: [CategoryCount!]!
  }

  type RevenueAnalytics {
    totalRevenue: Float!
    monthlyRevenue: [MonthlyRevenue!]!
    revenueByCategory: [CategoryRevenue!]!
    projectedRevenue: Float!
  }

  type UserAnalytics {
    totalUsers: Int!
    activeUsers: Int!
    newUsersThisMonth: Int!
    usersByRole: [RoleCount!]!
  }

  type StatusCount {
    status: String!
    count: Int!
  }

  type CategoryCount {
    category: String!
    count: Int!
  }

  type ProductPerformance {
    product: Product!
    soldQuantity: Int!
    revenue: Float!
  }

  type MonthlyRevenue {
    month: String!
    revenue: Float!
  }

  type CategoryRevenue {
    category: String!
    revenue: Float!
  }

  type RoleCount {
    role: String!
    count: Int!
  }

  # Connection Types
  type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
  }

  type ProductEdge {
    node: Product!
    cursor: String!
  }

  type OrderConnection {
    edges: [OrderEdge!]!
    pageInfo: PageInfo!
  }

  type OrderEdge {
    node: Order!
    cursor: String!
  }

  type RFQConnection {
    edges: [RFQEdge!]!
    pageInfo: PageInfo!
  }

  type RFQEdge {
    node: RFQ!
    cursor: String!
  }

  # Input Types
  input SignUpInput {
    email: String!
    password: String!
    firstName: String!
    lastName: String!
    role: Role!
    companyName: String!
  }

  input SignInInput {
    email: String!
    password: String!
  }

  input UpdateUserInput {
    firstName: String
    lastName: String
    phone: String
    twoFactorEnabled: Boolean
  }

  input CreateProductInput {
    sku: String!
    name: String!
    description: String!
    categoryId: ID!
    subcategory: String
    price: PriceInput!
    moq: Int!
    leadTime: Int!
    images: [String!]
    specifications: JSON
    tags: [String!]
  }

  input UpdateProductInput {
    name: String
    description: String
    categoryId: ID
    subcategory: String
    price: PriceInput
    moq: Int
    leadTime: Int
    images: [String!]
    specifications: JSON
    tags: [String!]
    status: ProductStatus
  }

  input PriceInput {
    amount: Float!
    currency: String!
    unit: String!
    tiers: [PriceTierInput!]
  }

  input PriceTierInput {
    minQuantity: Int!
    maxQuantity: Int
    price: Float!
  }

  input CreateRFQInput {
    title: String!
    description: String!
    categoryId: ID!
    products: [RFQProductInput!]!
    requirements: String
    deliveryAddress: AddressInput!
    deliveryDate: Date!
    budget: PriceRangeInput
    expiresAt: Date!
  }

  input RFQProductInput {
    productId: ID
    productName: String!
    quantity: Int!
    specifications: JSON
  }

  input AddressInput {
    street: String!
    city: String!
    state: String
    country: String!
    postalCode: String!
  }

  input PriceRangeInput {
    min: Float!
    max: Float!
    currency: String!
  }

  input CreateProposalInput {
    rfqId: ID!
    items: [ProposalItemInput!]!
    validUntil: Date!
    terms: String
  }

  input ProposalItemInput {
    productId: ID!
    quantity: Int!
    unitPrice: Float!
    notes: String
  }

  input CreateOrderInput {
    sellerId: ID!
    items: [OrderItemInput!]!
    shippingAddress: AddressInput!
    billingAddress: AddressInput!
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }

  input ProductFilterInput {
    categoryId: ID
    status: ProductStatus
    minPrice: Float
    maxPrice: Float
    supplierId: ID
    tags: [String!]
    search: String
  }

  input OrderFilterInput {
    status: OrderStatus
    buyerId: ID
    sellerId: ID
    dateFrom: Date
    dateTo: Date
  }

  input RFQFilterInput {
    categoryId: ID
    status: String
    buyerId: ID
    active: Boolean
  }

  # Queries
  type Query {
    # User Queries
    me: User @auth
    user(id: ID!): User @auth(requires: ADMIN)
    users(role: Role, limit: Int, offset: Int): [User!]! @auth(requires: ADMIN)

    # Product Queries
    product(id: ID!): Product
    products(
      filter: ProductFilterInput
      first: Int
      after: String
      last: Int
      before: String
    ): ProductConnection!
    searchProducts(query: String!, limit: Int): [Product!]!
    recommendedProducts(limit: Int): [Product!]! @auth

    # Category Queries
    categories: [Category!]!
    category(id: ID!): Category

    # Company Queries
    company(id: ID!): Company @auth
    companies(verified: Boolean, limit: Int, offset: Int): [Company!]! @auth

    # RFQ Queries
    rfq(id: ID!): RFQ @auth
    rfqs(
      filter: RFQFilterInput
      first: Int
      after: String
    ): RFQConnection! @auth
    myRFQs: [RFQ!]! @auth

    # Order Queries
    order(id: ID!): Order @auth
    orders(
      filter: OrderFilterInput
      first: Int
      after: String
    ): OrderConnection! @auth
    myOrders: [Order!]! @auth

    # Proposal Queries
    proposal(id: ID!): Proposal @auth
    proposalsForRFQ(rfqId: ID!): [Proposal!]! @auth
    myProposals: [Proposal!]! @auth

    # Analytics Queries
    analytics(dateFrom: Date!, dateTo: Date!): Analytics! @auth
    dashboardStats: JSON! @auth

    # Compliance Queries
    complianceDashboard: JSON! @auth(requires: ADMIN)
    certificationStatus(companyId: ID!): ComplianceInfo @auth
  }

  # Mutations
  type Mutation {
    # Auth Mutations
    signUp(input: SignUpInput!): AuthPayload!
    signIn(input: SignInInput!): AuthPayload!
    signOut: Boolean! @auth
    refreshToken(refreshToken: String!): AuthPayload!
    requestPasswordReset(email: String!): Boolean!
    resetPassword(token: String!, newPassword: String!): Boolean!
    enableTwoFactor: Boolean! @auth
    verifyTwoFactor(code: String!): Boolean! @auth

    # User Mutations
    updateProfile(input: UpdateUserInput!): User! @auth
    changePassword(currentPassword: String!, newPassword: String!): Boolean! @auth

    # Product Mutations
    createProduct(input: CreateProductInput!): Product! @auth(requires: SELLER)
    updateProduct(id: ID!, input: UpdateProductInput!): Product! @auth(requires: SELLER)
    deleteProduct(id: ID!): Boolean! @auth(requires: SELLER)
    uploadProductImage(productId: ID!, file: Upload!): String! @auth(requires: SELLER)

    # RFQ Mutations
    createRFQ(input: CreateRFQInput!): RFQ! @auth(requires: BUYER)
    updateRFQ(id: ID!, input: CreateRFQInput!): RFQ! @auth(requires: BUYER)
    cancelRFQ(id: ID!): Boolean! @auth(requires: BUYER)

    # Proposal Mutations
    createProposal(input: CreateProposalInput!): Proposal! @auth(requires: SELLER)
    updateProposal(id: ID!, input: CreateProposalInput!): Proposal! @auth(requires: SELLER)
    acceptProposal(id: ID!): Order! @auth(requires: BUYER)
    rejectProposal(id: ID!): Boolean! @auth(requires: BUYER)

    # Order Mutations
    createOrder(input: CreateOrderInput!): Order! @auth(requires: BUYER)
    updateOrderStatus(id: ID!, status: OrderStatus!): Order! @auth
    cancelOrder(id: ID!): Boolean! @auth
    confirmOrderDelivery(id: ID!): Order! @auth

    # Company Mutations
    updateCompanyInfo(input: JSON!): Company! @auth
    uploadCompanyDocument(type: String!, file: Upload!): String! @auth

    # Compliance Mutations
    submitCertification(input: JSON!): Certification! @auth
    approveCertification(id: ID!): Certification! @auth(requires: ADMIN)
    rejectCertification(id: ID!, reason: String!): Boolean! @auth(requires: ADMIN)
  }

  # Subscriptions
  type Subscription {
    # Order Subscriptions
    orderStatusChanged(orderId: ID!): Order! @auth
    newOrderReceived: Order! @auth(requires: SELLER)

    # RFQ Subscriptions
    newRFQPosted(categoryId: ID): RFQ! @auth(requires: SELLER)
    proposalReceived(rfqId: ID!): Proposal! @auth(requires: BUYER)

    # Chat Subscriptions
    messageReceived(conversationId: ID!): Message! @auth
    
    # Notification Subscriptions
    notificationReceived: Notification! @auth
  }

  type Message {
    id: ID!
    sender: User!
    content: String!
    timestamp: Date!
    read: Boolean!
  }

  type Notification {
    id: ID!
    type: String!
    title: String!
    message: String!
    data: JSON
    read: Boolean!
    createdAt: Date!
  }
`;
