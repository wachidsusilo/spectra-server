import express from 'express';

const httpRoute = express.Router();

httpRoute.get('/', (req, res) => {
    res.status(200).send("Welcome to SpectrA API");
});

export default httpRoute;