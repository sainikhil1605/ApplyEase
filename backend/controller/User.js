const User = require("../models/User");
const path = require("path");
const OpenAI = require("openai");
const fs = require("fs");

// const PdfReader = require("pdfreader").PdfReader;
const PDFParser = require("pdf2json");
const { API_KEY } = process.env;
const client = new OpenAI({
  apiKey: API_KEY,
});
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
  // Fire-and-forget: if resume uploaded, parse and upsert embedding to Python FAISS service
  try {
    const resumePath = req?.file?.path;
    if (resumePath) {
      const PDFParser = require("pdf2json");
      const parser = new PDFParser(this, 1);
      parser.on("pdfParser_dataReady", async () => {
        try {
          const resumeText = parser.getRawTextContent();
          if (typeof fetch === "function") {
            await fetch("http://localhost:8000/upsert_resume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: String(req.user._id),
                resume_text: resumeText,
              }),
            });
          }
        } catch (e) {
          console.error("Failed to upsert resume embedding:", e);
        }
      });
      parser.on("pdfParser_dataError", (err) => {
        console.error("PDF parse error:", err);
      });
      parser.loadPDF(path.resolve(resumePath));
    }
  } catch (e) {
    console.error(e);
  }
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
const generateCustomAnswer = async (req, res) => {
  const { jobDescription, applicationQuestion } = req.body;
  const resume_path = (await User.findById(req.user._id)).resume;
  console.log(resume_path);
  // const resume = fs.readFileSync(path.resolve(resume_path));
  let parsedResume = "";
  var pdfParser = new PDFParser(this, 1);
  pdfParser.on("pdfParser_dataReady", async (data) => {
    parsedResume = pdfParser.getRawTextContent();
    try {
      const messages = [
        {
          role: "user",
          content: `The resume is : ${parsedResume} Job description is: ${jobDescription} Question is: ${applicationQuestion}\n`,
        },
      ];

      const params = {
        model: "gpt-3.5-turbo-0125",
        messages,
      };

      const response = await client.chat.completions.create(params);
      console.log(response.choices[0].message);
      const answer = response.choices[0].message;
      return res.status(200).json(answer.content);
      // return res.status(200).json("Hello");
    } catch (error) {
      console.error("Error:", error);
      return null;
    }
  });
  pdfParser.loadPDF(path.resolve(resume_path));
};

// Compute resume-to-job-description match percentage using the Python embeddings service
const getMatchPercent = async (req, res) => {
  try {
    const { jobDescription } = req.body;
    if (!jobDescription || jobDescription.trim().length === 0) {
      return res.status(400).json({ message: "jobDescription is required" });
    }
    // Use pre-upserted resume embedding from FAISS service
    if (typeof fetch !== "function") {
      return res.status(500).json({ message: "fetch is not available on this Node runtime" });
    }
    const pyResp = await fetch("http://localhost:8000/match_for_user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: String(req.user._id),
        job_description: jobDescription,
      }),
    });
    if (!pyResp.ok) {
      const text = await pyResp.text();
      return res.status(pyResp.status).json({ message: "Embeddings service error", detail: text });
    }
    const data = await pyResp.json();
    return res.status(200).json({
      score: data.score,
      percent: data.percent,
      matchingWords: data.matching_words || [],
      missingWords: data.missing_words || [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
module.exports = {
  AddUser,
  getUserDetails,
  login,
  updateUserDetails,
  getResume,
  generateCustomAnswer,
  getMatchPercent,
};
