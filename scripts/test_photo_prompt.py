#!/usr/bin/env python3
"""Quick test for /api/photo-prompt using a generated test image."""
import base64, io, json, urllib.request

from PIL import Image, ImageDraw

# build a simple colorful test image
img = Image.new('RGB', (640, 420), (24, 26, 48))
d = ImageDraw.Draw(img)
d.ellipse([200, 90, 440, 330], fill=(230, 90, 160))
d.rectangle([0, 330, 640, 420], fill=(40, 120, 90))
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=88)
b64 = base64.b64encode(buf.getvalue()).decode()

payload = json.dumps({'image': 'data:image/jpeg;base64,' + b64}).encode()
req = urllib.request.Request(
    'http://localhost:3000/api/photo-prompt',
    data=payload,
    headers={'content-type': 'application/json'},
    method='POST',
)
with urllib.request.urlopen(req, timeout=110) as r:
    out = json.loads(r.read())
print('ok:', out.get('ok'))
print('prompt:', (out.get('prompt') or '')[:220])
print('negative:', (out.get('negativePrompt') or '')[:120])
print('description:', (out.get('description') or '')[:160])
print('tags:', out.get('tags'))
