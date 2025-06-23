@echo off
echo Starting FoodXchange Data Import...
echo.
echo Make sure MongoDB is running and CSV files are in the data folder
echo.
pause

node src\scripts\dataImport\importData.js

pause
