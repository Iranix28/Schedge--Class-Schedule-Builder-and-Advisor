from fastapi import APIRouter, HTTPException
from app.models.models import ChatRequest, ChatResponse
import requests
from pathlib import Path

from app.config.env_variables import OLLAMA_URL, API_KEY, MODEL


router = APIRouter(prefix="/ollama", tags=["Ollama"])

preprompt = " Your role is a class schedule and class advising at The University of Utah. Always address the school as The University of Utah " \
            " You can only talk about classes the student is asking about ONLY at the University of Utah." \
            " Your responses are short and concise. Quickly answer only the question the user asks and nothing else. " \
            " Please match the language of the user chatting with you." \
            " You can only talk about course descriptions" \
            " You can only suggest other classes ONLY if the user asks." \
            " Keep your responses no longer than 2 sentences unless its about classes the user is asking about"

system_prompt = "These are the classes you should know about. Paraphrase these descriptions and dont include brackets when asked about them:" \
"CS 3500 - Software Practice (Section 001) [Description: Practical exposure to the process of creating large software systems, including requirements specifications, design, implementation, testing, and maintenance. Emphasis on software process, software tools (debuggers, profilers, source code repositories, test harnesses), software engineering techniques (time management, code, and documentation standards, source code management, object-oriented analysis and design), and team development practice. Much of the work will be in groups and will involve modifying preexisting software systems.]" \
"CS 3810 - Computer Organization (Section 001) [Description: An in-depth study of computer architecture and design, including topics such as RISC and CISC instruction set architectures, CPU organizations, pipelining, memory systems, input/output, and parallel machines.  Emphasis is placed on performance measures and compilation issues.]" \
"CS 3130 - Eng Prob Stats (Section 001) [Description: An introduction to probability theory and statistics, with an emphasis on solving problems in electrical and computer engineering.  Topics in probability include discrete and continuous random variables, probability distributions, sums and functions of random variables, the law of large numbers, and the central limit theorem. Topics in statistics include sample mean and variance, estimating distributions, correlation, regression, and hypothesis testing.  Engineering applications include failure analysis, process control, communication systems, and speech recognition.]" \
"CS 3090 - Ethics in Computing (Section 001) [Description: In this course, we will explore the moral, social, and ethical ramifications of the choices we make as computing professionals. Through class discussions, case studies, exercises, and projects, students will learn the basics of ethical thinking in science, understand a representative sample of current ethical dilemmas in computing, and study the distinct challenges associated with ethics in computing.]"

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    print("in ollama router")
    try:
        payload = {
            "model": MODEL,
            "stream": False,  # keep it simple for now
            "messages": [
                {"role": "system", "content": preprompt},
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.message}
            ],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        }

        r = requests.post(OLLAMA_URL, json=payload, headers=headers, timeout=60)
        r.raise_for_status()
        data = r.json()

        # standard OpenAI style response
        reply = data["choices"][0]["message"]["content"]
        return ChatResponse(reply=reply)

    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))             #TODO: make detailed exception later 