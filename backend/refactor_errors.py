import os
import re

src_dir = r"f:\Applier\backend\src"

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # 1. Add `next` to async controller signatures
    # Matches `export const getProfile = async (req, res) => {`
    content = re.sub(
        r'(export const \w+\s*=\s*async\s*\(\s*req,\s*res\s*)\)',
        r'\1, next)',
        content
    )

    # 2. Replace generic catch blocks
    # Matches:
    # } catch (error) {
    #   console.error(...);
    #   res.status(500).json(...);
    # }
    
    # We use a non-greedy match to find the catch block body that ends with a 500 status response.
    pattern = r'(\} catch \(error\) \{)\s*console\.error[^\n]*\n\s*res\.status\(500\)\.json\([^\)]+\);\n\s*\}'
    content = re.sub(pattern, r'\1\n    next(error);\n  }', content)
    
    # Also handle some that have `return res.status(500)`
    pattern2 = r'(\} catch \(error\) \{)\s*console\.error[^\n]*\n\s*return res\.status\(500\)\.json\([^\)]+\);\n\s*\}'
    content = re.sub(pattern2, r'\1\n    next(error);\n  }', content)
    
    # Also handle auth.middleware.js where it's `catch (error) { res.status(401)... }`
    pattern_auth = r'(\} catch \(error\) \{)\s*(?:console\.error[^\n]*\n\s*)?(?:return\s+)?res\.status\(\d+\)\.json\([^\)]+\);\n\s*\}'
    content = re.sub(pattern_auth, r'\1\n    next(error);\n  }', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Refactored: {filepath}")

for root, _, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.js'):
            process_file(os.path.join(root, file))
