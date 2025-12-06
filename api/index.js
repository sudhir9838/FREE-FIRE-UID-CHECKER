const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

app.get("/accinfo", async (req, res) => {
    const uid = req.query.uid;
    const region = req.query.region || "IND";

    if (!uid) {
        return res.json({ error: "UID required" });
    }

    try {
        const apiURL = `https://ffcheckhid.vercel.app/accinfo?uid=${uid}&region=${region}`;
        const response = await axios.get(apiURL);
        res.json(response.data);
    } catch (err) {
        res.json({ error: "Failed to fetch data" });
    }
});

module.exports = app;