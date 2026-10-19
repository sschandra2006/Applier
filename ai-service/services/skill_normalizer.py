"""
Skill Normalizer Service
Provides deterministic skill matching, canonical naming, alias mapping,
and category tagging across technical domains.
"""

import re
from typing import Dict, List, Optional, Set, Tuple

# Canonical skill mappings: canonical_name -> list of aliases / variants
CANONICAL_SKILL_ALIASES: Dict[str, List[str]] = {
    # Languages
    "JavaScript": ["js", "javascript", "ecmascript", "es6", "es6+", "vanilla js"],
    "TypeScript": ["ts", "typescript"],
    "Python": ["python", "python3", "python 3", "py"],
    "Java": ["java", "java 8", "java 11", "java 17", "java 21", "core java"],
    "C++": ["c++", "cpp", "c plus plus"],
    "C#": ["c#", "csharp", "c sharp", ".net c#"],
    "Go": ["go", "golang"],
    "Rust": ["rust", "rustlang"],
    "Ruby": ["ruby", "ruby on rails"],
    "PHP": ["php", "php7", "php8"],
    "Swift": ["swift", "swiftui"],
    "Kotlin": ["kotlin", "kotlin multiplatform"],
    "Dart": ["dart", "flutter dart"],
    "SQL": ["sql", "structured query language", "ansi sql"],
    "Shell": ["bash", "shell", "sh", "zsh", "powershell"],

    # Frontend
    "React": ["react", "react.js", "reactjs", "react js"],
    "Next.js": ["next.js", "nextjs", "next js", "next"],
    "Vue.js": ["vue", "vue.js", "vuejs", "vue 3", "vue2"],
    "Nuxt.js": ["nuxt", "nuxt.js", "nuxtjs"],
    "Angular": ["angular", "angular.js", "angularjs", "angular 2+"],
    "Svelte": ["svelte", "sveltekit", "svelte.js"],
    "HTML5": ["html", "html5"],
    "CSS3": ["css", "css3", "vanilla css"],
    "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
    "Sass": ["sass", "scss"],
    "Redux": ["redux", "redux toolkit", "rtk"],
    "Zustand": ["zustand"],
    "Webpack": ["webpack"],
    "Vite": ["vite", "vitejs"],

    # Backend & APIs
    "Node.js": ["node", "node.js", "nodejs"],
    "Express.js": ["express", "express.js", "expressjs"],
    "NestJS": ["nest", "nestjs", "nest.js"],
    "FastAPI": ["fastapi", "fast api"],
    "Django": ["django", "django rest framework", "drf"],
    "Flask": ["flask"],
    "Spring Boot": ["spring", "spring boot", "springboot", "spring framework"],
    "ASP.NET Core": ["asp.net", "asp.net core", ".net core", "dotnet", "dotnet core"],
    "GraphQL": ["graphql", "apollo", "apollo graphql"],
    "REST API": ["rest", "restful", "rest api", "restful api", "rest apis", "restful apis"],
    "gRPC": ["grpc", "protocol buffers", "protobuf"],
    "WebSockets": ["websocket", "websockets", "socket.io"],

    # Databases & Caching
    "PostgreSQL": ["postgres", "postgresql", "psql"],
    "MySQL": ["mysql"],
    "MongoDB": ["mongo", "mongodb"],
    "Redis": ["redis", "redis cache"],
    "SQLite": ["sqlite", "sqlite3"],
    "DynamoDB": ["dynamodb", "aws dynamodb"],
    "Cassandra": ["cassandra", "apache cassandra"],
    "Elasticsearch": ["elasticsearch", "elastic search", "opensearch"],
    "Snowflake": ["snowflake"],
    "BigQuery": ["bigquery", "google bigquery"],
    "Firebase": ["firebase", "firestore", "firebase auth", "firebase realtime database"],

    # Cloud & Infrastructure
    "Amazon Web Services": ["aws", "amazon web services", "amazon cloud"],
    "AWS Lambda": ["lambda", "aws lambda"],
    "AWS S3": ["s3", "aws s3"],
    "AWS EC2": ["ec2", "aws ec2"],
    "Google Cloud Platform": ["gcp", "google cloud", "google cloud platform"],
    "Microsoft Azure": ["azure", "microsoft azure"],
    "Docker": ["docker", "dockerfile", "docker compose"],
    "Kubernetes": ["k8s", "kubernetes", "k8", "kube"],
    "Terraform": ["terraform", "tf"],
    "Ansible": ["ansible"],
    "CI/CD": ["ci/cd", "cicd", "continuous integration", "continuous deployment"],
    "GitHub Actions": ["github actions", "gh actions"],
    "GitLab CI": ["gitlab ci", "gitlab ci/cd"],
    "Jenkins": ["jenkins"],
    "Linux": ["linux", "ubuntu", "debian", "centos", "unix"],
    "Git": ["git", "github", "gitlab"],

    # AI, ML & Data
    "PyTorch": ["pytorch", "torch"],
    "TensorFlow": ["tensorflow", "tf"],
    "Scikit-Learn": ["scikit-learn", "sklearn"],
    "Pandas": ["pandas"],
    "NumPy": ["numpy"],
    "Hugging Face": ["huggingface", "hugging face", "hf"],
    "LangChain": ["langchain"],
    "LlamaIndex": ["llamaindex", "llama-index"],
    "Vector Database": ["vector database", "vectordb", "pinecone", "qdrant", "weaviate", "milvus", "chroma", "chromadb"],
    "LLM": ["llm", "large language models", "generative ai", "genai", "prompt engineering"],
    "Machine Learning": ["machine learning", "ml", "deep learning", "nlp", "computer vision"],

    # Architecture & Practices
    "Microservices": ["microservices", "microservice architecture", "distributed microservices"],
    "Distributed Systems": ["distributed systems", "distributed computing", "high throughput systems"],
    "Event-Driven Architecture": ["event-driven", "event-driven architecture", "eda", "kafka", "rabbitmq"],
    "Test-Driven Development": ["tdd", "test-driven development", "unit testing", "integration testing"],
    "Object-Oriented Programming": ["oop", "object-oriented programming", "ood"],
    "Agile": ["agile", "scrum", "kanban", "sprints"]
}

# Reverse lookup table: lower_alias -> canonical_name
_ALIAS_TO_CANONICAL: Dict[str, str] = {}
for canonical, aliases in CANONICAL_SKILL_ALIASES.items():
    _ALIAS_TO_CANONICAL[canonical.lower()] = canonical
    for alias in aliases:
        _ALIAS_TO_CANONICAL[alias.lower()] = canonical


def _clean_token(text: str) -> str:
    """Strips leading/trailing whitespace and normalizes punctuation for comparison."""
    if not text:
        return ""
    # Strip edge punctuation but preserve symbols like +, #, .
    s = text.strip().lower()
    s = re.sub(r"^[^\w+#.]+|[^\w+#.]+$", "", s)
    return s


def normalize_skill(skill_name: str) -> str:
    """
    Returns the canonical skill name if recognized in the knowledge base,
    or a cleaned capitalized version if not directly mapped.
    
    Examples:
        "react.js" -> "React"
        "k8s" -> "Kubernetes"
        "postgres" -> "PostgreSQL"
        "aws" -> "Amazon Web Services"
    """
    if not skill_name or not skill_name.strip():
        return ""
    
    raw = skill_name.strip()
    cleaned = _clean_token(raw)
    
    # 1. Exact match in alias dictionary
    if cleaned in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[cleaned]
    
    # 2. Check without trailing versions (e.g. "Python 3.11" -> "Python")
    base_ver = re.sub(r"\s+\d+(\.\d+)*$", "", cleaned)
    if base_ver in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[base_ver]

    # 3. If unrecognized, preserve original casing or capitalize nicely
    return raw


def is_known_skill(skill_name: str) -> bool:
    """Returns True if the skill is recognized in the canonical knowledge base."""
    if not skill_name or not skill_name.strip():
        return False
    cleaned = _clean_token(skill_name)
    if cleaned in _ALIAS_TO_CANONICAL:
        return True
    base_ver = re.sub(r"\s+\d+(\.\d+)*$", "", cleaned)
    if base_ver in _ALIAS_TO_CANONICAL:
        return True
    return False


def extract_canonical_skill(text: str) -> Optional[str]:
    """
    Extracts the primary canonical skill from a phrase or requirement string.
    Returns None if no known technical skill is recognized.
    """
    if not text:
        return None
    if is_known_skill(text):
        return normalize_skill(text)
    known = extract_known_skills_from_text(text)
    if known:
        return known[0]
    return None


def is_skill_match(skill_candidate: str, skill_required: str) -> Tuple[bool, float, str]:
    """
    Determines if a candidate skill matches a required skill.
    
    Returns:
        (is_match: bool, confidence: float, match_type: str)
        match_type can be: "EXACT", "NORMALIZED_ALIAS", "SUBSTRING", "NONE"
    """
    if not skill_candidate or not skill_required:
        return False, 0.0, "NONE"
    
    c_raw = skill_candidate.strip()
    r_raw = skill_required.strip()

    # 1. Exact match (case-insensitive)
    if c_raw.lower() == r_raw.lower():
        return True, 1.0, "EXACT"

    # 2. Canonical alias match
    c_norm = normalize_skill(c_raw)
    r_norm = normalize_skill(r_raw)
    if c_norm.lower() == r_norm.lower() and c_norm != "":
        return True, 0.98, "NORMALIZED_ALIAS"

    # 3. Clean token comparison
    c_clean = _clean_token(c_raw)
    r_clean = _clean_token(r_raw)
    if c_clean == r_clean and c_clean != "":
        return True, 0.95, "EXACT"

    # 4. Check if one is a recognized alias of the other
    if c_clean in _ALIAS_TO_CANONICAL and _ALIAS_TO_CANONICAL[c_clean].lower() == r_norm.lower():
        return True, 0.95, "NORMALIZED_ALIAS"
    if r_clean in _ALIAS_TO_CANONICAL and _ALIAS_TO_CANONICAL[r_clean].lower() == c_norm.lower():
        return True, 0.95, "NORMALIZED_ALIAS"

    # 5. Boundary-safe substring match (e.g., "React (Hooks, Context)" matches "React")
    pattern_r = r"\b" + re.escape(r_clean) + r"\b"
    if len(r_clean) > 2 and re.search(pattern_r, c_clean):
        return True, 0.85, "SUBSTRING"

    pattern_c = r"\b" + re.escape(c_clean) + r"\b"
    if len(c_clean) > 2 and re.search(pattern_c, r_clean):
        return True, 0.85, "SUBSTRING"

    return False, 0.0, "NONE"


def extract_known_skills_from_text(text: str) -> List[str]:
    """
    Deterministic scanner extracting recognized technical skills and aliases from text.
    Sorts matches by occurrence and canonicalizes them.
    """
    if not text:
        return []

    found_canonical: Set[str] = set()
    lower_text = text.lower()

    # Scan alias dictionary using word-boundary regex
    for alias, canonical in _ALIAS_TO_CANONICAL.items():
        # Avoid short ambiguous false positives like 'c' or 'go' without boundaries
        if len(alias) <= 2 and alias not in ["c#", "c++", "ts", "js", "go", "r", "ai", "ml", "ui", "ux"]:
            continue

        # Regex with boundary
        pattern = r"(?<!\w)" + re.escape(alias) + r"(?!\w)"
        if re.search(pattern, lower_text):
            found_canonical.add(canonical)

    return sorted(list(found_canonical))


class SkillNormalizer:
    """Wrapper class providing object-oriented access to skill normalizer utilities."""
    def normalize_skill(self, skill: str) -> str:
        return normalize_skill(skill)
    def is_known_skill(self, skill: str) -> bool:
        return is_known_skill(skill)
    def is_skill_match(self, c: str, r: str) -> Tuple[bool, float, str]:
        return is_skill_match(c, r)
    def extract_canonical_skill(self, text: str) -> Optional[str]:
        return extract_canonical_skill(text)
    def extract_known_skills_from_text(self, text: str) -> List[str]:
        return extract_known_skills_from_text(text)


skill_normalizer = SkillNormalizer()

