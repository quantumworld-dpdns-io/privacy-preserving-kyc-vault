const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const winston = require('winston');
const expressWinston = require('express-winston');
const rateLimit = require('express-rate-limit');
const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GraphQL schema definition
const schema = buildSchema(`
  type Query {
    hello: String
    health: String
    # Payment queries
    getPaymentIntent(id: ID!): PaymentIntent
    listPaymentIntents(limit: Int): [PaymentIntent!]!
    # Identity verification queries
    getVerificationResult(id: ID!): VerificationResult
    listVerificationResults(limit: Int): [VerificationResult!]!
    # Credit scoring queries
    getCreditReport(ssn: String!): CreditReport
    # Address verification queries
    validateAddress(address: String!): AddressValidation
    # Messaging queries
    getMessageStatus(id: ID!): MessageStatus
    # Email queries
    getEmailDeliveryStatus(id: ID!): EmailDeliveryStatus
    # File storage queries
    getFileMetadata(fileId: ID!): FileMetadata
    listFiles(prefix: String): [FileMetadata!]!
    # Blockchain queries
    getBalance(address: String!): Balance
    getTransaction(txHash: String!): Transaction
    # Authentication queries
    getUserProfile(token: String!): UserProfile
  }

  type Mutation {
    # Payment mutations
    createPaymentIntent(amount: Int!, currency: String!, paymentMethodTypes: [String!]!): PaymentIntent
    confirmPaymentIntent(id: ID!, paymentMethodId: String): PaymentIntent
    cancelPaymentIntent(id: ID!): PaymentIntent
    # Identity verification mutations
    startVerification(type: String!, data: String!): VerificationResult
    # Credit scoring mutations
    requestCreditReport(ssn: String!, purpose: String!): CreditReport
    # Address verification mutations
    geocodeAddress(address: String!): AddressValidation
    # Messaging mutations
    sendSMS(to: String!, body: String!): MessageStatus
    sendWhatsApp(to: String!, body: String!): MessageStatus
    # Email mutations
    sendEmail(to: String!, subject: String!, body: String!, html: String): EmailDeliveryStatus
    # File storage mutations
    uploadFile(filename: String!, content: String!, bucket: String): FileMetadata
    deleteFile(fileId: ID!): Boolean
    # Blockchain mutations
    sendTransaction(from: String!, to: String!, amount: String!, privateKey: String!): Transaction
    # Authentication mutations
    loginWithGoogle(token: String!): UserProfile
    loginWithFacebook(token: String!): UserProfile
    loginWithApple(token: String!): UserProfile
  }

  type PaymentIntent {
    id: ID!
    amount: Int!
    currency: String!
    status: String!
    clientSecret: String
    paymentMethodTypes: [String!]!
    created: String!
  }

  type VerificationResult {
    id: ID!
    type: String!
    status: String!
    data: String
    created: String!
    expires: String
  }

  type CreditReport {
    ssn: String!
    score: Int!
    report: String!
    bureau: String!
    retrieved: String!
  }

  type AddressValidation {
    input: String!
    valid: Boolean!
    standardized: String
    components: String
    latitude: Float
    longitude: Float
  }

  type MessageStatus {
    id: ID!
    to: String!
    body: String!
    status: String!
    sent: String!
    cost: Float
  }

  type EmailDeliveryStatus {
    id: ID!
    to: String!
    subject: String!
    status: String!
    sent: String!
    opens: Int!
    clicks: Int!
  }

  type FileMetadata {
    id: ID!
    filename: String!
    bucket: String!
    size: Int!
    contentType: String!
    uploaded: String!
    url: String
  }

  type Balance {
    address: String!
    balance: String!
    currency: String!
  }

  type Transaction {
    hash: String!
    from: String!
    to: String!
    value: String!
    gasUsed: String!
    blockNumber: Int!
    confirmed: Boolean!
  }

  type UserProfile {
    id: ID!
    email: String!
    name: String!
    picture: String
    provider: String!
  }
`);

// Root resolver
const root = {
  hello: () => 'Hello world!',
  health: () => 'OK',
  
  // Payment resolvers
  getPaymentIntent: () => ({ id: uuidv4(), amount: 1000, currency: 'usd', status: 'succeeded' }),
  listPaymentIntents: () => [],
  createPaymentIntent: (args) => ({ 
    id: uuidv4(), 
    amount: args.amount, 
    currency: args.currency, 
    status: 'requires_payment_method',
    clientSecret: `pi_${uuidv4()}_secret_${uuidv4()}`,
    paymentMethodTypes: args.paymentMethodTypes,
    created: new Date().toISOString()
  }),
  confirmPaymentIntent: () => ({ id: uuidv4(), amount: 1000, currency: 'usd', status: 'succeeded' }),
  cancelPaymentIntent: () => ({ id: uuidv4(), amount: 1000, currency: 'usd', status: 'canceled' }),
  
  // Identity verification resolvers
  startVerification: () => ({ 
    id: uuidv4(), 
    type: 'document', 
    status: 'pending', 
    data: 'verification_data',
    created: new Date().toISOString(),
    expires: new Date(Date.now() + 24*60*60*1000).toISOString()
  }),
  getVerificationResult: () => ({ 
    id: uuidv4(), 
    type: 'document', 
    status: 'verified', 
    data: 'verification_data',
    created: new Date().toISOString(),
    expires: new Date(Date.now() + 24*60*60*1000).toISOString()
  }),
  listVerificationResults: () => [],
  
  // Credit scoring resolvers
  requestCreditReport: () => ({ 
    ssn: 'xxx-xx-1234', 
    score: 750, 
    report: 'detailed_report_data', 
    bureau: 'Experian',
    retrieved: new Date().toISOString()
  }),
  getCreditReport: () => ({ 
    ssn: 'xxx-xx-1234', 
    score: 750, 
    report: 'detailed_report_data', 
    bureau: 'Experian',
    retrieved: new Date().toISOString()
  }),
  
  // Address verification resolvers
  validateAddress: () => ({ 
    input: '123 Main St', 
    valid: true, 
    standardized: '123 Main Street',
    components: 'street_number: 123, route: Main St',
    latitude: 40.7128,
    longitude: -74.0060
  }),
  geocodeAddress: () => ({ 
    input: '123 Main St', 
    valid: true, 
    standardized: '123 Main Street',
    components: 'street_number: 123, route: Main St',
    latitude: 40.7128,
    longitude: -74.0060
  }),
  
  // Messaging resolvers
  sendSMS: () => ({ 
    id: uuidv4(), 
    to: '+1234567890', 
    body: 'Hello World', 
    status: 'sent', 
    sent: new Date().toISOString(),
    cost: 0.0075
  }),
  sendWhatsApp: () => ({ 
    id: uuidv4(), 
    to: '+1234567890', 
    body: 'Hello World', 
    status: 'sent', 
    sent: new Date().toISOString(),
    cost: 0.005
  }),
  getMessageStatus: () => ({ 
    id: uuidv4(), 
    to: '+1234567890', 
    body: 'Hello World', 
    status: 'delivered', 
    sent: new Date().toISOString(),
    cost: 0.0075
  }),
  
  // Email resolvers
  sendEmail: () => ({ 
    id: uuidv4(), 
    to: 'user@example.com', 
    subject: 'Test Email', 
    status: 'sent', 
    sent: new Date().toISOString(),
    opens: 0,
    clicks: 0
  }),
  getEmailDeliveryStatus: () => ({ 
    id: uuidv4(), 
    to: 'user@example.com', 
    subject: 'Test Email', 
    status: 'sent', 
    sent: new Date().toISOString(),
    opens: 0,
    clicks: 0
  }),
  
  // File storage resolvers
  uploadFile: () => ({ 
    id: uuidv4(), 
    filename: 'test.txt', 
    bucket: 'kyc-vault-files',
    size: 1024,
    contentType: 'text/plain',
    uploaded: new Date().toISOString(),
    url: `https://kyc-vault-files.s3.amazonaws.com/${uuidv4()}/test.txt`
  }),
  deleteFile: () => true,
  getFileMetadata: () => ({ 
    id: uuidv4(), 
    filename: 'test.txt', 
    bucket: 'kyc-vault-files',
    size: 1024,
    contentType: 'text/plain',
    uploaded: new Date().toISOString(),
    url: `https://kyc-vault-files.s3.amazonaws.com/${uuidv4()}/test.txt`
  }),
  listFiles: () => [],
  
  // Blockchain resolvers
  getBalance: () => ({ 
    address: '0x742d35Cc6634C0532925a3b8D4C0532950532950', 
    balance: '1000000000000000000', // 1 ETH in wei
    currency: 'ETH'
  }),
  getTransaction: () => ({ 
    hash: '0x1234...', 
    from: '0x742d35Cc6634C0532925a3b8D4C0532950532950', 
    to: '0x742d35Cc6634C0532925a3b8D4C0532950532951', 
    value: '1000000000000000000', // 1 ETH in wei
    gasUsed: '21000',
    blockNumber: 12345,
    confirmed: true
  }),
  sendTransaction: () => ({ 
    hash: `0x${uuidv4().replace(/-/g, '')}`, 
    from: '0x742d35Cc6634C0532925a3b8D4C0532950532950', 
    to: '0x742d35Cc6634C0532925a3b8D4C0532950532951', 
    value: '1000000000000000000', // 1 ETH in wei
    gasUsed: '21000',
    blockNumber: 12345,
    confirmed: true
  }),
  
  // Authentication resolvers
  loginWithGoogle: () => ({ 
    id: uuidv4(), 
    email: 'user@gmail.com', 
    name: 'John Doe', 
    picture: 'https://lh3.googleusercontent.com/a/AAcHTtef...',
    provider: 'google'
  }),
  loginWithFacebook: () => ({ 
    id: uuidv4(), 
    email: 'user@facebook.com', 
    name: 'Jane Doe', 
    picture: 'https://platform-lookaside.fbsbx.com/platform/profilepic/',
    provider: 'facebook'
  }),
  loginWithApple: () => ({ 
    id: uuidv4(), 
    email: 'user@icloud.com', 
    name: 'Apple User', 
    picture: null,
    provider: 'apple'
  }),
  getUserProfile: () => ({ 
    id: uuidv4(), 
    email: 'user@example.com', 
    name: 'John Doe', 
    picture: 'https://example.com/profile.jpg',
    provider: 'custom'
  }),
};

// GraphQL endpoint
app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: process.env.NODE_ENV !== 'production',
}));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Not found');
});

// Start server
const server = createServer(app);
server.listen(port, () => {
  logger.info(`Aggregation service running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

module.exports = app;
