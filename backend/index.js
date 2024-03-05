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
const port = process.env.PORT || 3000;

app.get("/login", (req, res) => {
  fs.readFile("./static/login/login.html", (err, data) => {
    if (err) {
      res.status(404).send("404 Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(data);
    res.end();
  });
});
app.get("/dashboard", authMiddleware, (req, res) => {
  const data = getUserDetails(req, res);
  res.send(require("./static/dashboard/dashboard.html"));
});
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
