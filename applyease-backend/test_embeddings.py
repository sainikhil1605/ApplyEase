# test_embeddings.py
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

model = SentenceTransformer('all-MiniLM-L6-v2')

resume = "Software engineer skilled in Python, AWS, and Docker."
jd = "Looking for backend developer experienced in AWS and Python."

vec_resume = model.encode(resume)
vec_jd = model.encode(jd)

similarity = cosine_similarity([vec_resume], [vec_jd])[0][0]
print(f"Match %: {similarity * 100:.2f}%")
