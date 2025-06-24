# FoodXchange Data Migration Checklist

## Pre-Migration Steps

### 1. Data Files Setup
- [ ] Copy `Suppliers 23_6_2025.xlsx` to `/data` folder
- [ ] Copy `Products 23_6_2025.csv` to `/data` folder
- [ ] Copy `Supplier Contacts 23_6_2025.csv` to `/data` folder
- [ ] Copy other CSV files to `/data` folder

### 2. Environment Setup
- [ ] Install Node.js dependencies: `npm install`
- [ ] Create `.env` file from `.env.template`
- [ ] Set MongoDB connection string
- [ ] Create uploads directories

### 3. Data Validation
- [ ] Run data preparation: `node data/prepareData.js`
- [ ] Review `supplier_issues.json`
- [ ] Fix critical data issues
- [ ] Verify email addresses are valid

## Migration Steps

### 1. Database Setup
```bash
# Start MongoDB
mongod

# Create database
mongo
> use foodxchange
> db.createCollection('sellers')
> db.createCollection('products')
```

### 2. Import Suppliers
```bash
cd backend
node scripts/import/importData.js
```

### 3. Verify Import
```bash
# Check import results
mongo foodxchange
> db.sellers.count()
> db.products.count()
```

### 4. Generate Reports
```bash
# Generate migration report
node scripts/generateReport.js
```

## Post-Migration

### 1. Data Verification
- [ ] Verify supplier count matches
- [ ] Check product associations
- [ ] Test supplier login
- [ ] Verify search functionality

### 2. Email Notifications
- [ ] Send welcome emails to suppliers
- [ ] Include temporary passwords
- [ ] Provide platform guide

### 3. Monitoring
- [ ] Monitor error logs
- [ ] Track login attempts
- [ ] Check for missing data

## Rollback Plan

If issues occur:
1. Drop collections: `db.sellers.drop()`
2. Restore from backup
3. Fix issues and retry

## Support Contacts

- Technical Issues: [Your Email]
- Data Questions: [Your Email]
- Emergency: [Your Phone]
