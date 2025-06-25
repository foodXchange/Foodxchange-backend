const fs = require('fs');
const path = require('path');

console.log('🔍 FoodXchange Data Migration Preparation');
console.log('=========================================');

// Check for data files
const dataPath = path.join(__dirname, '../../data');
const requiredFiles = [
    'Suppliers 23_6_2025.xlsx',
    'Products 23_6_2025.csv',
    'Buyers 23_6_2025.csv',
    'Orders 23_6_2025.csv',
    'Supplier Contacts 23_6_2025.csv'
];

console.log('📁 Checking for data files...');

let filesFound = 0;
requiredFiles.forEach(file => {
    const filePath = path.join(dataPath, file);
    if (fs.existsSync(filePath)) {
        console.log(✅ Found: );
        filesFound++;
    } else {
        console.log(❌ Missing: );
    }
});

console.log(\n📊 Summary: / files found);

if (filesFound === requiredFiles.length) {
    console.log('🎉 All data files present - ready for migration!');
} else {
    console.log('⚠️  Please ensure all CSV/Excel files are in the data/ directory');
}

console.log('\n🚀 Next steps:');
console.log('1. Configure your .env file with MongoDB and Azure credentials');
console.log('2. Run: npm run migrate');
console.log('3. Start the server: npm run dev');
