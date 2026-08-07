import os
import json

class PromptManager:
    def __init__(self, prompts_dir: str = None):
        if not prompts_dir:
            prompts_dir = os.path.join(os.path.dirname(__file__), "..", "prompts")
        self.prompts_dir = prompts_dir

    def get_prompt(self, agent: str) -> dict:
        """
        Loads the system.md, user.md, examples.md, and schema.json for the specified agent.
        """
        agent_dir = os.path.join(self.prompts_dir, agent)
        if not os.path.exists(agent_dir):
            raise FileNotFoundError(f"Prompts directory not found for agent: {agent}")
            
        def read_file(filename: str, default: str = "") -> str:
            path = os.path.join(agent_dir, filename)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return f.read().strip()
            return default
            
        def read_json(filename: str, default: dict = None) -> dict:
            path = os.path.join(agent_dir, filename)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            return default or {}

        return {
            "system": read_file("system.md"),
            "user_template": read_file("user.md"),
            "examples": read_file("examples.md"),
            "schema": read_json("schema.json")
        }

prompt_manager = PromptManager()
