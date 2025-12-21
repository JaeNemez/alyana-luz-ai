from dotenv import load_dotenv
import os
from google import genai

print("== Loading .env ==")
load_dotenv()

key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
print("Key is None? ", key is None)

if not key:
    print("No key found in environment variables.")
    raise SystemExit(1)

print("Prefix:", key[:4])
print("Masked:", key[:4] + "..." + key[-4:])
print("Length:", len(key))

client = genai.Client(api_key=key)

try:
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    print(f"== Calling Gemini ({model}) ==")
    resp = client.models.generate_content(
        model=model,
        contents="Say a short prayer about school."
    )
    print("Response text:")
    print(resp.text)
except Exception as e:
    print("ERROR FROM GEMINI:")
    print(repr(e))
    raise


