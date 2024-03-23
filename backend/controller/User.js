const User = require("../models/User");
const path = require("path");
const handleUpload = (req) => {
  if (!req.body.resume) {
    return null;
  }
  const resume = req.body.resume;
};
const AddUser = async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json({ user });
};
const getUserDetails = async (req, res) => {
  //   const user = await User.findById(req.params.id);
  const user = await User.findById(req.user._id).select("-password");
  res.status(200).json({ user });
};
const updateUserDetails = async (req, res) => {
  req.body = {
    ...req.body,
    ...(req.body.urls && { urls: req.body.urls.map((url) => JSON.parse(url)) }),
  };
  const user = await User.findByIdAndUpdate(req.user._id, {
    ...req.body,
    ...(req?.file?.path && { resume: req.file.path }),
  });
  res.status(200).json({ user });
};
const login = async (req, res) => {
  const { email, password } = req.body;
  console.log(email);
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }
  const isMatch = await user.checkPassword(password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid credentials" });
  } else {
    const token = user.generateAuthToken();
    res.status(200).json({ token });
  }
};
const getResume = async (req, res) => {
  const user = await User.findById(req.user._id);
  const resumeUrl = `${user.resume}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=file.pdf");

  // Send the PDF file as response
  res.sendFile(path.resolve(resumeUrl));

  // res.status(200).json({ resume: user.resume });
};
module.exports = {
  AddUser,
  getUserDetails,
  login,
  updateUserDetails,
  getResume,
};
