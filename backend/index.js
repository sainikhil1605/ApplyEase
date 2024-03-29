const express = require("express");
const cors = require("cors");
const fs = require("fs");
require("dotenv").config();
const connectDB = require("./db/connectDB");
const authMiddleware = require("./middleware/auth");
const { getUserDetails } = require("./controller/User");
const session = require("express-session");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
const { API_KEY, PORT } = process.env;
const port = PORT || 3000;

app.use("/", require("./router/User"));
const startServer = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
    console.log("Database connected");
  } catch (error) {
    console.log(error);
  }
};

startServer();
