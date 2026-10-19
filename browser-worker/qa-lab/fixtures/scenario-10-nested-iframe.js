/**
 * QA Lab Scenario 10: Nested Iframe Form
 * Application form embedded inside a nested frame hierarchy (Page -> Parent Frame -> Child Frame).
 */

export const scenario10 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-10-nested-iframe',
  scenarioNumber: 10,
  name: 'Nested Iframe Hierarchy',
  description: 'Two levels of embedded iframes hosting deep nested authentication controls.',
  category: 'HIERARCHY_ISOLATION',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that only check direct child frames and fail to recurse into nested frame subtrees.',
  resilienceStrategy: 'Recursive frame traversal across all levels of the frame tree.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Nested Iframe</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    iframe { width: 100%; height: 400px; border: 2px solid #333; }
  </style>
</head>
<body>
  <h1>Outer Application Window</h1>
  <p>Top-level window embedding external gateway frame:</p>

  <iframe
    id="parentFrame"
    name="parentFrame"
    srcdoc="<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 15px; background: #eef2f5; }
    iframe { width: 100%; height: 260px; border: 2px dashed #990000; }
  </style>
</head>
<body>
  <h2>Level 1 Gateway Frame</h2>
  <iframe
    id='nestedChildFrame'
    name='nestedChildFrame'
    srcdoc='<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 10px; background: #ffffff; }
    input { width: 80%; padding: 5px; margin-bottom: 8px; }
    button { padding: 6px 12px; background: #990000; color: white; border: none; cursor: pointer; }
    #nestedConfirm { display: none; color: green; font-weight: bold; margin-top: 8px; }
  </style>
</head>
<body>
  <h4>Level 2 Secure Child Frame</h4>
  <form id=&quot;deepForm&quot;>
    <label for=&quot;nestedAadhaar&quot;>Government ID / Aadhaar</label><br/>
    <input type=&quot;text&quot; id=&quot;nestedAadhaar&quot; name=&quot;aadhaarNumber&quot; placeholder=&quot;12-digit Aadhaar&quot; required /><br/>
    <button type=&quot;submit&quot; id=&quot;nestedVerifyBtn&quot;>Submit To Level 2</button>
  </form>
  <div id=&quot;nestedConfirm&quot;>Deep Identity Verified!</div>
  <script>
    document.getElementById(&quot;deepForm&quot;).addEventListener(&quot;submit&quot;, (e) => {
      e.preventDefault();
      document.getElementById(&quot;deepForm&quot;).style.display = &quot;none&quot;;
      document.getElementById(&quot;nestedConfirm&quot;).style.display = &quot;block&quot;;
    });
  </script>
</body>
</html>'
  ></iframe>
</body>
</html>"
  ></iframe>
</body>
</html>`
};
