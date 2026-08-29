#!/usr/bin/env python3
"""
Ollama Smart Filling Benchmark for ApplyEase

Tests the LLM's ability to generate tailored answers for job application questions.
Measures: Response Time, Answer Quality, Relevance to Resume/JD
"""

import requests
import time
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Configuration
API_BASE = "http://127.0.0.1:8000"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://100.95.121.45:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")

# Test credentials
TEST_EMAIL = f"benchmark_test_{int(time.time())}@example.com"
TEST_PASSWORD = "BenchmarkTest123!"

# Sample resume text for testing
SAMPLE_RESUME = """
Senior Software Engineer with 5+ years of experience in full-stack development.

SKILLS:
- Languages: Python, JavaScript, TypeScript, Java, Go
- Frontend: React, Vue.js, Angular, Next.js
- Backend: FastAPI, Django, Node.js, Express
- Databases: PostgreSQL, MongoDB, Redis, Elasticsearch
- Cloud: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes
- Tools: Git, CI/CD, Jenkins, GitHub Actions

EXPERIENCE:
Software Engineer III at TechCorp (2021-Present)
- Led development of microservices architecture serving 1M+ daily users
- Reduced API latency by 60% through caching strategies and query optimization
- Mentored team of 4 junior developers, conducting code reviews and pair programming
- Implemented automated testing pipeline achieving 95% code coverage

Software Engineer at StartupXYZ (2019-2021)
- Built real-time data processing pipeline handling 500K events/hour
- Developed customer-facing dashboard using React and TypeScript
- Integrated third-party APIs for payment processing and notifications

EDUCATION:
B.S. Computer Science, State University (2019)
- GPA: 3.8, Dean's List
- Relevant Coursework: Algorithms, Distributed Systems, Machine Learning
"""

# Sample job description
SAMPLE_JOB_DESCRIPTION = """
Senior Backend Engineer - Cloud Platform Team

We're looking for a Senior Backend Engineer to join our Cloud Platform team and help build 
scalable, reliable infrastructure that powers our products.

Requirements:
- 5+ years of backend development experience
- Strong proficiency in Python or Go
- Experience with cloud platforms (AWS, GCP, or Azure)
- Knowledge of containerization (Docker, Kubernetes)
- Experience with PostgreSQL or similar databases
- Strong communication and collaboration skills

Responsibilities:
- Design and implement scalable backend services
- Optimize system performance and reliability
- Collaborate with cross-functional teams
- Mentor junior engineers
- Participate in on-call rotation

Nice to have:
- Experience with distributed systems
- Knowledge of CI/CD pipelines
- Open source contributions
"""

# Benchmark test cases - common job application questions
TEST_QUESTIONS = [
    {
        "category": "Experience",
        "question": "Describe a challenging technical project you led and its outcome.",
        "expected_keywords": ["microservices", "architecture", "team", "led", "optimization", "performance"]
    },
    {
        "category": "Problem Solving",
        "question": "Tell us about a time you solved a complex technical problem.",
        "expected_keywords": ["latency", "caching", "optimization", "reduced", "solution", "analysis"]
    },
    {
        "category": "Teamwork",
        "question": "How do you approach mentoring junior developers?",
        "expected_keywords": ["mentor", "code review", "pair programming", "team", "guidance", "junior"]
    },
    {
        "category": "Technical Skills",
        "question": "Why are you interested in this role and what skills make you a good fit?",
        "expected_keywords": ["Python", "AWS", "backend", "scalable", "experience", "cloud"]
    },
    {
        "category": "Leadership",
        "question": "Describe your experience working in a fast-paced environment.",
        "expected_keywords": ["agile", "deadline", "priority", "team", "delivery", "collaboration"]
    },
    {
        "category": "Growth",
        "question": "What areas of technology are you most excited to learn more about?",
        "expected_keywords": ["cloud", "distributed", "learning", "technology", "interested", "growth"]
    },
    {
        "category": "Conflict Resolution",
        "question": "Tell us about a time you disagreed with a technical decision. How did you handle it?",
        "expected_keywords": ["discussion", "team", "approach", "solution", "compromise", "communication"]
    },
    {
        "category": "Impact",
        "question": "What is your most significant professional achievement?",
        "expected_keywords": ["users", "impact", "improvement", "led", "successful", "achievement"]
    }
]


def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    APPLYEASE OLLAMA SMART FILLING BENCHMARK                  ║
║                                                                              ║
║  Testing LLM capabilities for generating tailored job application answers   ║
╚══════════════════════════════════════════════════════════════════════════════╝
    """)


def print_section(title):
    print(f"\n{'═' * 70}")
    print(f"  {title}")
    print(f"{'═' * 70}")


def check_ollama_connection():
    """Check if Ollama server is reachable"""
    print_section("CHECKING OLLAMA CONNECTION")
    try:
        r = requests.get(f"{OLLAMA_HOST}", timeout=5)
        print(f"  ✓ Ollama server reachable at {OLLAMA_HOST}")
        
        # Check if model is available
        r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
        if r.status_code == 200:
            models = r.json().get("models", [])
            model_names = [m.get("name", "") for m in models]
            if any(LLM_MODEL in name for name in model_names):
                print(f"  ✓ Model '{LLM_MODEL}' is available")
            else:
                print(f"  ⚠ Model '{LLM_MODEL}' not found. Available: {model_names[:5]}")
        return True
    except Exception as e:
        print(f"  ✗ Cannot connect to Ollama: {e}")
        return False


def setup_test_user():
    """Create test user and upload resume"""
    print_section("SETTING UP TEST USER")
    
    # Signup
    print("  Creating test account...")
    r = requests.post(f"{API_BASE}/signup", json={
        "first_name": "Benchmark",
        "last_name": "Test",
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if r.status_code != 200:
        print(f"  ✗ Signup failed: {r.text}")
        return None
    
    data = r.json()
    token = data.get("token")
    user_id = data.get("user", {}).get("id")
    print(f"  ✓ Created user: {TEST_EMAIL}")
    
    # Upload resume
    print("  Uploading test resume...")
    r = requests.post(f"{API_BASE}/upsert_resume", json={
        "user_id": user_id,
        "resume_text": SAMPLE_RESUME
    })
    
    if r.status_code == 200:
        print(f"  ✓ Resume uploaded successfully")
    else:
        print(f"  ⚠ Resume upload issue: {r.text}")
    
    return token


def calculate_relevance_score(answer, expected_keywords):
    """Calculate how many expected keywords appear in the answer"""
    answer_lower = answer.lower()
    found = sum(1 for kw in expected_keywords if kw.lower() in answer_lower)
    return found / len(expected_keywords) * 100


def benchmark_question(token, question_data, job_description):
    """Benchmark a single question"""
    headers = {"Authorization": f"Bearer {token}"}
    
    start_time = time.time()
    r = requests.post(
        f"{API_BASE}/custom-answer",
        headers=headers,
        json={
            "jobDescription": job_description,
            "applicationQuestion": question_data["question"]
        },
        timeout=60
    )
    response_time = (time.time() - start_time) * 1000  # ms
    
    if r.status_code != 200:
        return {
            "success": False,
            "error": r.text,
            "response_time_ms": response_time
        }
    
    answer = r.json().get("answer", "")
    word_count = len(answer.split())
    relevance = calculate_relevance_score(answer, question_data["expected_keywords"])
    
    return {
        "success": True,
        "answer": answer,
        "response_time_ms": round(response_time, 2),
        "word_count": word_count,
        "relevance_score": round(relevance, 1),
        "expected_keywords": question_data["expected_keywords"],
        "found_keywords": [kw for kw in question_data["expected_keywords"] if kw.lower() in answer.lower()]
    }


def run_benchmark(token):
    """Run the full benchmark suite"""
    print_section("RUNNING SMART FILLING BENCHMARK")
    print(f"\n  Model: {LLM_MODEL}")
    print(f"  Questions: {len(TEST_QUESTIONS)}")
    print(f"  Job Description: Senior Backend Engineer position")
    
    results = []
    
    for i, q in enumerate(TEST_QUESTIONS, 1):
        print(f"\n  [{i}/{len(TEST_QUESTIONS)}] {q['category']}: {q['question'][:50]}...")
        
        result = benchmark_question(token, q, SAMPLE_JOB_DESCRIPTION)
        result["category"] = q["category"]
        result["question"] = q["question"]
        results.append(result)
        
        if result["success"]:
            print(f"      ✓ {result['response_time_ms']:.0f}ms | {result['word_count']} words | {result['relevance_score']}% relevance")
        else:
            print(f"      ✗ Failed: {result.get('error', 'Unknown error')[:50]}")
    
    return results


def print_results(results):
    """Print formatted benchmark results"""
    print_section("BENCHMARK RESULTS")
    
    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    
    if not successful:
        print("\n  ✗ All tests failed!")
        return
    
    # Calculate statistics
    avg_time = sum(r["response_time_ms"] for r in successful) / len(successful)
    avg_words = sum(r["word_count"] for r in successful) / len(successful)
    avg_relevance = sum(r["relevance_score"] for r in successful) / len(successful)
    min_time = min(r["response_time_ms"] for r in successful)
    max_time = max(r["response_time_ms"] for r in successful)
    
    # Performance grade
    if avg_time < 3000:
        time_grade = "A+"
    elif avg_time < 5000:
        time_grade = "A"
    elif avg_time < 8000:
        time_grade = "B"
    elif avg_time < 12000:
        time_grade = "C"
    else:
        time_grade = "D"
    
    if avg_relevance >= 60:
        relevance_grade = "A+"
    elif avg_relevance >= 50:
        relevance_grade = "A"
    elif avg_relevance >= 40:
        relevance_grade = "B"
    elif avg_relevance >= 30:
        relevance_grade = "C"
    else:
        relevance_grade = "D"
    
    # Determine overall grade
    grade_map = {"A+": 5, "A": 4, "B": 3, "C": 2, "D": 1}
    overall_score = (grade_map[time_grade] + grade_map[relevance_grade]) / 2
    if overall_score >= 4.5:
        overall_grade = "A+"
    elif overall_score >= 3.5:
        overall_grade = "A"
    elif overall_score >= 2.5:
        overall_grade = "B"
    elif overall_score >= 1.5:
        overall_grade = "C"
    else:
        overall_grade = "D"
    
    print(f"""
┌──────────────────────────────────────────────────────────────────────────────┐
│                         OLLAMA SMART FILLING BENCHMARK                       │
│                              Model: {LLM_MODEL:<20}                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RESPONSE TIME                                                               │
│  ────────────────────────────────────────────────────────────────────────    │
│  Average Response Time:     {avg_time:>8.0f} ms                                     │
│  Fastest Response:          {min_time:>8.0f} ms                                     │
│  Slowest Response:          {max_time:>8.0f} ms                                     │
│  Time Grade:                {time_grade:>8}                                         │
│                                                                              │
│  ANSWER QUALITY                                                              │
│  ────────────────────────────────────────────────────────────────────────    │
│  Average Word Count:        {avg_words:>8.0f} words                                 │
│  Target Range:                120-180 words                                  │
│  Average Relevance Score:   {avg_relevance:>8.1f}%                                    │
│  Relevance Grade:           {relevance_grade:>8}                                         │
│                                                                              │
│  SUCCESS RATE                                                                │
│  ────────────────────────────────────────────────────────────────────────    │
│  Successful Responses:      {len(successful):>8} / {len(results)}                                     │
│  Success Rate:              {len(successful)/len(results)*100:>8.1f}%                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  OVERALL GRADE:             {overall_grade:>8} 🏆                                        │
└──────────────────────────────────────────────────────────────────────────────┘
    """)
    
    # Detailed breakdown by category
    print("\n  DETAILED BREAKDOWN BY CATEGORY")
    print("  " + "─" * 66)
    print(f"  {'Category':<18} {'Time (ms)':<12} {'Words':<10} {'Relevance':<12} {'Grade'}")
    print("  " + "─" * 66)
    
    for r in successful:
        cat_grade = "A" if r["relevance_score"] >= 50 else ("B" if r["relevance_score"] >= 33 else "C")
        print(f"  {r['category']:<18} {r['response_time_ms']:<12.0f} {r['word_count']:<10} {r['relevance_score']:<12.1f}% {cat_grade}")
    
    print("  " + "─" * 66)
    
    # Sample answers
    print("\n  SAMPLE GENERATED ANSWERS")
    print("  " + "─" * 66)
    
    for i, r in enumerate(successful[:3], 1):  # Show first 3 answers
        print(f"\n  [{i}] {r['category']}: {r['question'][:60]}...")
        print(f"      Keywords found: {', '.join(r['found_keywords'])}")
        print(f"      Answer preview: {r['answer'][:200]}...")
    
    return {
        "model": LLM_MODEL,
        "total_questions": len(results),
        "successful": len(successful),
        "failed": len(failed),
        "avg_response_time_ms": round(avg_time, 2),
        "min_response_time_ms": round(min_time, 2),
        "max_response_time_ms": round(max_time, 2),
        "avg_word_count": round(avg_words, 1),
        "avg_relevance_score": round(avg_relevance, 1),
        "time_grade": time_grade,
        "relevance_grade": relevance_grade,
        "overall_grade": overall_grade
    }


def cleanup_test_user(token):
    """Optional cleanup"""
    # In a real scenario, you might want to delete the test user
    pass


def main():
    print_banner()
    
    # Check Ollama connection
    if not check_ollama_connection():
        print("\n  ⚠ Cannot proceed without Ollama connection")
        return
    
    # Setup test user
    token = setup_test_user()
    if not token:
        print("\n  ⚠ Cannot proceed without test user")
        return
    
    # Run benchmark
    results = run_benchmark(token)
    
    # Print results
    summary = print_results(results)
    
    # Save results to file
    if summary:
        output_file = "benchmark_results.json"
        with open(output_file, "w") as f:
            json.dump({
                "summary": summary,
                "detailed_results": results
            }, f, indent=2)
        print(f"\n  Results saved to: {output_file}")
    
    print("\n" + "═" * 70)
    print("  Benchmark complete!")
    print("═" * 70 + "\n")


if __name__ == "__main__":
    main()
