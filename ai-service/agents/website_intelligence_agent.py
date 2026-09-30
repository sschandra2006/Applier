import re
import logging
from bs4 import BeautifulSoup
from urllib.parse import urlparse

logger = logging.getLogger("WebsiteIntelligenceAgent")

# Portal type patterns: maps URL/title keywords to portal category
PORTAL_PATTERNS = {
    "nsp": ["nsp.gov", "scholarships.gov", "national scholarship"],
    "passport": ["passportindia.gov", "passport seva", "passportseva"],
    "pan": ["incometax.gov", "efiling.incometax", "pan card"],
    "aadhaar": ["uidai.gov", "aadhaar", "myaadhaar"],
    "driving_licence": ["parivahan.gov", "sarathi.nic", "driving licence", "driving license"],
    "admission": ["admission", "apply.ac", "college.ac", "university.ac", ".edu/apply", "ugapplication"],
    "banking": ["bank", "netbanking", "sbi.co.in", "hdfcbank", "icicibank"],
    "government": [".gov.in", ".nic.in", "india.gov", "mygov.in"],
    "loan": ["loan", "emi", "homeloan", "mudra"],
}

# Input types that indicate a file upload
UPLOAD_TYPES = {"file"}

# Input types to skip (hidden, submit, button, reset, image)
SKIP_TYPES = {"hidden", "submit", "button", "reset", "image"}

# Common CAPTCHA/OTP indicators
OTP_CAPTCHA_INDICATORS = [
    "otp", "captcha", "verification code", "one time password",
    "g-recaptcha", "recaptcha", "h-captcha"
]


class WebsiteIntelligenceAgent:
    """
    Real DOM intelligence agent using BeautifulSoup.
    Parses HTML to extract form structure, fields, selectors,
    validations, and navigation elements.
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        scanned_pages = raw_data.get("pages", [])
        raw_html = raw_data.get("html", "")
        url = raw_data.get("url", "")
        title = raw_data.get("title", "")

        if not raw_html and not scanned_pages:
            logger.warning("[WebsiteIntelligenceAgent] No HTML or pages provided in context.")
            return {
                "action": "analyzed_dom",
                "portal": "unknown",
                "metadata": {"steps": [], "fields": [], "validations": [], "navigation": {}},
                "confidence": 0.0,
            }

        try:
            # Multi-page site scan processing
            if scanned_pages and isinstance(scanned_pages, list):
                all_fields = []
                all_steps = []
                all_validations = []
                combined_nav = {}
                total_forms = 0
                total_inputs = 0
                has_frames = False
                has_captcha = False
                seen_selectors = set()

                for p_idx, p in enumerate(scanned_pages):
                    p_html = p.get("html", "")
                    p_url = p.get("url", url)
                    p_title = p.get("title", title)
                    if not p_html:
                        continue

                    p_soup = BeautifulSoup(p_html, "html.parser")
                    for tag in p_soup(["script", "style", "svg", "path", "noscript", "header", "footer"]):
                        tag.decompose()

                    dom_info = self._analyze_dom(p_soup)
                    total_forms += dom_info["formCount"]
                    total_inputs += dom_info["inputCount"]
                    has_frames = has_frames or dom_info["hasFrames"]
                    has_captcha = has_captcha or dom_info["hasCaptcha"]

                    p_steps = self._extract_workflow(p_soup, {"portal_type": "generic"})
                    for step in p_steps:
                        step["page_title"] = p_title
                        step["page_url"] = p_url
                        all_steps.append(step)

                    p_fields = self._extract_fields(p_soup)
                    for f in p_fields:
                        if f["selector"] not in seen_selectors:
                            seen_selectors.add(f["selector"])
                            f["page_title"] = p_title
                            f["page_url"] = p_url
                            all_fields.append(f)

                    nav = self._extract_navigation(p_soup)
                    for k, v in nav.items():
                        if k not in combined_nav and v:
                            combined_nav[k] = v

                first_soup = BeautifulSoup(scanned_pages[0].get("html", "") if scanned_pages else raw_html, "html.parser")
                portal_type = self._identify_portal(url, title, first_soup)
                all_validations = self._extract_validations(all_fields)
                app_options = self._extract_application_options(scanned_pages, first_soup)

                field_count = len(all_fields)
                confidence = min(0.97, 0.55 + (field_count / 20))

                logger.info(f"[WebsiteIntelligenceAgent] Analyzed full site scan for {url}: pages={len(scanned_pages)}, fields={field_count}, options={len(app_options)}")

                return {
                    "action": "analyzed_dom",
                    "portal": portal_type,
                    "title": title,
                    "url": url,
                    "metadata": {
                        "domSummary": {
                            "formCount": total_forms,
                            "inputCount": total_inputs,
                            "hasFrames": has_frames,
                            "hasCaptcha": has_captcha,
                            "pagesScanned": len(scanned_pages)
                        },
                        "steps": all_steps,
                        "fields": all_fields,
                        "validations": all_validations,
                        "navigation": combined_nav,
                        "applicationOptions": app_options,
                        "pages": scanned_pages
                    },
                    "confidence": round(confidence, 2),
                }

            # Single page fallback
            soup = BeautifulSoup(raw_html, "html.parser")
            for tag in soup(["script", "style", "svg", "path", "noscript", "header", "footer"]):
                tag.decompose()

            dom_summary = self._analyze_dom(soup)
            portal_type = self._identify_portal(url, title, soup)
            knowledge = self._match_knowledge(portal_type)
            workflow_steps = self._extract_workflow(soup, knowledge)
            fields = self._extract_fields(soup)
            validations = self._extract_validations(fields)
            navigation = self._extract_navigation(soup)

            field_count = len(fields)
            confidence = min(0.95, 0.5 + (field_count / 20))

            logger.info(f"[WebsiteIntelligenceAgent] Analyzed single page {url}: portal={portal_type}, fields={field_count}")

            return {
                "action": "analyzed_dom",
                "portal": portal_type,
                "title": title,
                "url": url,
                "metadata": {
                    "domSummary": dom_summary,
                    "steps": workflow_steps,
                    "fields": fields,
                    "validations": validations,
                    "navigation": navigation,
                },
                "confidence": round(confidence, 2),
            }

        except Exception as e:
            logger.error(f"[WebsiteIntelligenceAgent] DOM parsing failed: {e}", exc_info=True)
            return {
                "action": "analyzed_dom",
                "portal": "unknown",
                "metadata": {"steps": [], "fields": [], "validations": [], "navigation": {}},
                "confidence": 0.0,
                "error": str(e),
            }

    # ──────────────────────────────────────────────────────
    # DOM ANALYSIS
    # ──────────────────────────────────────────────────────

    def _analyze_dom(self, soup: BeautifulSoup) -> dict:
        forms = soup.find_all("form")
        all_inputs = soup.find_all(["input", "select", "textarea"])
        return {
            "formCount": len(forms),
            "inputCount": len(all_inputs),
            "hasFrames": bool(soup.find("iframe")),
            "hasCaptcha": self._detect_captcha_otp(soup),
        }

    # ──────────────────────────────────────────────────────
    # PORTAL IDENTIFICATION
    # ──────────────────────────────────────────────────────

    def _identify_portal(self, url: str, title: str, soup: BeautifulSoup) -> str:
        text_to_check = (url + " " + title + " " + soup.get_text(separator=" ", strip=True)[:500]).lower()
        for portal_type, patterns in PORTAL_PATTERNS.items():
            if any(p in text_to_check for p in patterns):
                return portal_type
        return "generic_portal"

    # ──────────────────────────────────────────────────────
    # KNOWLEDGE MATCHING (template lookup placeholder)
    # ──────────────────────────────────────────────────────

    def _match_knowledge(self, portal_type: str) -> dict:
        # Future: query ChromaDB or a static knowledge base for portal-specific templates
        return {"portal_type": portal_type}

    # ──────────────────────────────────────────────────────
    # WORKFLOW STEP EXTRACTION
    # ──────────────────────────────────────────────────────

    def _extract_workflow(self, soup: BeautifulSoup, knowledge: dict) -> list:
        steps = []
        # Use fieldsets as natural page/group boundaries
        fieldsets = soup.find_all("fieldset")
        if fieldsets:
            for i, fs in enumerate(fieldsets):
                legend = fs.find("legend")
                step_name = legend.get_text(strip=True) if legend else f"Step {i + 1}"
                steps.append({"step_number": i + 1, "step_name": step_name})
        else:
            # Fall back: detect multi-step via tab/accordion patterns
            tabs = soup.select("[role='tab'], .tab, .step, .wizard-step, .nav-step")
            for i, tab in enumerate(tabs):
                steps.append({"step_number": i + 1, "step_name": tab.get_text(strip=True)})

        if not steps:
            steps = [{"step_number": 1, "step_name": "Application Form"}]

        return steps

    # ──────────────────────────────────────────────────────
    # FIELD EXTRACTION (the core method)
    # ──────────────────────────────────────────────────────

    def _extract_fields(self, soup: BeautifulSoup) -> list:
        fields = []
        seen_selectors = set()

        all_inputs = soup.find_all(["input", "select", "textarea"])

        for element in all_inputs:
            input_type = (element.get("type") or "text").lower()

            # Skip non-interactive inputs
            if input_type in SKIP_TYPES:
                continue

            # Build the best selector for this element
            selector = self._build_selector(element)
            if not selector or selector in seen_selectors:
                continue
            seen_selectors.add(selector)

            # Build field name/id
            field_id = (
                element.get("id") or
                element.get("name") or
                element.get("data-field") or
                re.sub(r"[^a-z0-9_]", "_", selector.replace("#", "").replace(".", "").replace("[", "").replace("]", "").replace("=", "_").replace('"', ""))[:40]
            )

            # Find associated label
            label = self._find_label(soup, element)

            # Skip website UI widgets (Language selection, Google Translate, Theme/Font toggles, Cookie banners)
            if re.search(r"language|lang_select|translate|accessibility|fontsize|theme|cookie", field_id + " " + label, re.I):
                continue

            # Detect OTP/CAPTCHA fields
            if self._is_otp_or_captcha(element, label):
                input_type = "pause"

            is_optional = "optional" in (label or "").lower() or "optional" in (element.get("placeholder", "")).lower()
            field = {
                "name": field_id,
                "type": "file" if input_type in UPLOAD_TYPES else input_type,
                "label": label,
                "selector": selector,
                "required": (element.has_attr("required") or element.get("aria-required") == "true") or not is_optional,
                "placeholder": element.get("placeholder", ""),
            }

            # Add options for select/radio fields
            if element.name == "select":
                field["options"] = [
                    {"value": opt.get("value", ""), "label": opt.get_text(strip=True)}
                    for opt in element.find_all("option")
                    if opt.get("value")
                ]
            elif input_type == "radio":
                field["options"] = self._find_radio_options(soup, element.get("name", ""))

            # Add upload constraints for file inputs
            if input_type == "file":
                field["constraints"] = self._extract_upload_constraints(element, soup)

            fields.append(field)

        return fields

    def _build_selector(self, element) -> str:
        """Build the most stable CSS selector for an element."""
        # Priority: id > name > data attributes > class
        if element_id := element.get("id"):
            return f"#{element_id}"
        if name := element.get("name"):
            tag = element.name
            return f'{tag}[name="{name}"]'
        if element.name == "textarea":
            placeholder = element.get("placeholder", "")
            if placeholder:
                return f'textarea[placeholder="{placeholder}"]'
        # Last resort: class-based
        classes = element.get("class", [])
        if classes:
            return f'{element.name}.{".".join(classes[:2])}'
        return ""

    def _find_label(self, soup: BeautifulSoup, element) -> str:
        """Find the human-readable label for an input element."""
        # Method 1: <label for="id">
        if element_id := element.get("id"):
            label_tag = soup.find("label", attrs={"for": element_id})
            if label_tag:
                return label_tag.get_text(strip=True)

        # Method 2: aria-label attribute
        if aria_label := element.get("aria-label"):
            return aria_label

        # Method 3: aria-labelledby
        if labelledby := element.get("aria-labelledby"):
            label_el = soup.find(id=labelledby)
            if label_el:
                return label_el.get_text(strip=True)

        # Method 4: Wrap — parent <label>
        parent = element.parent
        if parent and parent.name == "label":
            return parent.get_text(separator=" ", strip=True)

        # Method 5: Nearby <label> sibling
        prev = element.find_previous_sibling("label")
        if prev:
            return prev.get_text(strip=True)

        # Method 6: Placeholder as fallback
        return element.get("placeholder", element.get("name", ""))

    def _find_radio_options(self, soup: BeautifulSoup, name: str) -> list:
        options = []
        for radio in soup.find_all("input", {"type": "radio", "name": name}):
            label = self._find_label(soup, radio)
            options.append({"value": radio.get("value", ""), "label": label})
        return options

    def _extract_upload_constraints(self, element, soup: BeautifulSoup) -> dict:
        """Extract file upload constraints from HTML attributes and nearby text."""
        constraints = {}

        # Accept attribute
        if accept := element.get("accept"):
            constraints["acceptedFormats"] = [f.strip() for f in accept.split(",")]

        # Size hints from nearby text (common in Indian government portals)
        nearby_text = ""
        parent = element.parent
        for _ in range(3):  # Search up to 3 ancestors
            if parent:
                nearby_text = (parent.get_text(separator=" ", strip=True) or "").lower()
                parent = parent.parent if parent else None
            if nearby_text:
                break

        # Common size patterns: "max 500kb", "max 2mb", "maximum size 1 mb"
        size_match = re.search(r"max(?:imum)?\s*(?:size\s*)?(\d+)\s*(kb|mb)", nearby_text)
        if size_match:
            size_val = int(size_match.group(1))
            unit = size_match.group(2)
            constraints["maxSizeBytes"] = size_val * (1024 if unit == "kb" else 1024 * 1024)

        # Dimension patterns: "200x200", "at least 200px"
        dim_match = re.search(r"(\d+)\s*[x×]\s*(\d+)", nearby_text)
        if dim_match:
            constraints["minDimensions"] = {
                "width": int(dim_match.group(1)),
                "height": int(dim_match.group(2)),
            }

        return constraints

    # ──────────────────────────────────────────────────────
    # VALIDATION EXTRACTION
    # ──────────────────────────────────────────────────────

    def _extract_validations(self, fields: list) -> list:
        validations = []
        for field in fields:
            rules = {}
            if field.get("required"):
                rules["required"] = True
            validations.append({"field": field["name"], "rules": rules})
        return validations

    # ──────────────────────────────────────────────────────
    # NAVIGATION EXTRACTION
    # ──────────────────────────────────────────────────────

    def _extract_navigation(self, soup: BeautifulSoup) -> dict:
        nav = {}

        # Find submit button
        submit = (
            soup.find("button", {"type": "submit"}) or
            soup.find("input", {"type": "submit"}) or
            soup.find("button", string=re.compile(r"submit|apply|proceed|confirm", re.I))
        )
        if submit:
            nav["submit_button"] = self._build_selector(submit)

        # Find next button (multi-step forms)
        next_btn = soup.find("button", string=re.compile(r"next|continue|proceed", re.I))
        if next_btn:
            nav["next_button"] = self._build_selector(next_btn)

        # Find previous/back button
        prev_btn = soup.find("button", string=re.compile(r"back|previous|prev", re.I))
        if prev_btn:
            nav["prev_button"] = self._build_selector(prev_btn)

        return nav

    # ──────────────────────────────────────────────────────
    # HELPERS
    # ──────────────────────────────────────────────────────

    def _detect_captcha_otp(self, soup: BeautifulSoup) -> bool:
        page_text = soup.get_text(separator=" ", strip=True).lower()
        return any(indicator in page_text for indicator in OTP_CAPTCHA_INDICATORS)

    def _is_otp_or_captcha(self, element, label: str) -> bool:
        combined = (
            (element.get("id") or "") + " " +
            (element.get("name") or "") + " " +
            (element.get("class") or [""])[0] + " " +
            label
        ).lower()
        return any(indicator in combined for indicator in OTP_CAPTCHA_INDICATORS)

    def _extract_application_options(self, scanned_pages: list, soup: BeautifulSoup) -> list:
        options = []
        seen_labels = set()

        # 1. Extract application tabs (e.g. "New Application", "Resume Application")
        tab_elements = soup.select(".tab, [role='tab'], [data-toggle='tab'], .nav-tabs a, button[id*='tab'], div[id*='tab'], a[href*='Register'], a[href*='Token']")
        for tab in tab_elements:
            tab_text = tab.get_text(strip=True)
            if tab_text and len(tab_text) > 2 and len(tab_text) < 60 and tab_text.lower() not in seen_labels:
                seen_labels.add(tab_text.lower())
                options.append({
                    "id": f"tab_{len(options) + 1}",
                    "label": tab_text,
                    "isExternal": False
                })

        # 2. Extract CTA options from scanned pages
        for p in scanned_pages:
            ctas = p.get("ctaOptions", [])
            for cta in ctas:
                url = cta.get("url")
                label = (cta.get("label") or "").strip()
                if url and label.lower() not in seen_labels and len(label) > 2:
                    seen_labels.add(label.lower())
                    options.append({
                        "id": f"opt_{len(options) + 1}",
                        "label": label,
                        "url": url,
                        "isExternal": cta.get("isExternal", False)
                    })

        return options
