import os
import re

routes_dir = r"f:\Applier\ai-service\api\routes"

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # We want to remove:
    # try:
    #     ...
    # except Exception as e:
    #     raise HTTPException(status_code=500, detail=str(e))
    #
    # Wait, it's safer to just replace `except Exception as e:\n        raise HTTPException(status_code=500...`
    # Actually, removing `try:` is hard via simple regex because we have to un-indent.
    # Alternatively, replace `except Exception as e:\n        raise HTTPException(...)` with `except Exception:\n        raise`
    
    # Matches: except Exception as e: (with or without logging)
    #          raise HTTPException(status_code=500, detail=...)
    pattern = r'except Exception as e:\s*(?:logger\.exception[^\n]*\n\s*)?raise HTTPException\(status_code=500[^\)]+\)'
    
    content = re.sub(pattern, r'except Exception:\n        raise', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Refactored: {filepath}")

for root, _, files in os.walk(routes_dir):
    for file in files:
        if file.endswith('.py'):
            process_file(os.path.join(root, file))
