const {
  AddUser,
  getUserDetails,
  login,
  updateUserDetails,
  getResume,
  generateCustomAnswer,
  getMatchPercent,
} = require("../controller/User");
const authMiddleware = require("../middleware/auth");
const uploadMiddleware = require("../middleware/multerUpload");

const router = require("express").Router();

router.post("/signup", AddUser);
router.get("/user", authMiddleware, getUserDetails);
router.post("/login", login);
router.patch(
  "/user",
  authMiddleware,
  uploadMiddleware.single("resume"),
  updateUserDetails
);
router.post("/custom-answer", authMiddleware, generateCustomAnswer);
router.get("/resume", authMiddleware, getResume);
router.post("/match", authMiddleware, getMatchPercent);
module.exports = router;
