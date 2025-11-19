from dotenv import load_dotenv
import os
from google import genai

print("== Loading .env ==")
load_dotenv()

key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
print("Key is None? ", key is None)

if key:
    print("Prefix:", key[:4])
    print("Masked:", key[:4] + "..." + key[-4:])
    print("Length:", len(key))

    try:
        client = genai.Client(api_key=key)
        print("== Calling Gemini with simple string contents ==")
        resp = client.models.generate_content(
            model="gemini-2.0-flash",
            contents="Say a short prayer about school."
        )
        print("Response text:")
        print(resp.text)
    except Exception as e:
        print("ERROR FROM GEMINI:")
        print(repr(e))
else:
    print("No key found in environment variables.")

