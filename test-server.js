const express = require('express');
const app = express();
const PORT = 5000;

app.get('/', (req, res) => {
    res.json({ message: 'FoodXchange Backend is running!' });
});

app.listen(PORT, () => {
    console.log(Test server running on http://localhost:);
});
