import os
import json
from PIL import Image, ImageDraw, ImageFont

ARTIFACTS_DIR = r"C:\Users\Osama Yusouf\.gemini\antigravity\brain\f608478c-72b0-4894-8cae-93bb137c1243\screenshots"
FRAMES_DIR = os.path.join(ARTIFACTS_DIR, "katana_frames")
MANIFEST_PATH = os.path.join(ARTIFACTS_DIR, "katana_frames_manifest.json")

with open(MANIFEST_PATH, "r") as f:
    manifest = json.load(f)

frame_list = manifest["frames"]
crop_box = (250, 195, 1030, 625) # 780x430 modal bounds

cropped_images = []
frame_durations = []

for idx, item in enumerate(frame_list):
    img_path = item["path"]
    im = Image.open(img_path).convert("RGBA")
    cropped = im.crop(crop_box)
    cropped_images.append(cropped)

    # Calculate frame duration
    if idx < len(frame_list) - 1:
        next_t = frame_list[idx + 1]["t"]
        dur = max(40, next_t - item["t"])
    else:
        dur = 350 # hold final frame
    frame_durations.append(dur)

# 1. Generate full-resolution 25-frame GIF
gif_path = os.path.join(ARTIFACTS_DIR, "katana_execution_sequence.gif")
p_frames = [f.convert("RGB").convert("P", palette=Image.Palette.ADAPTIVE) for f in cropped_images]
p_frames[0].save(
    gif_path,
    save_all=True,
    append_images=p_frames[1:],
    duration=frame_durations,
    loop=0,
    optimize=True
)
print(f"Generated 25-Frame GIF: {gif_path} ({os.path.getsize(gif_path)} bytes)")

# 2. Select 12 key frames for the composite Storyboard
storyboard_indices = [0, 2, 4, 6, 8, 10, 12, 14, 15, 19, 21, 22]
storyboard_labels = [
    "1. 0ms - Target Locked & Sheath Grip",
    "2. 260ms - Lightning Dash Accel",
    "3. 410ms - Crossing Mid-Arena",
    "4. 520ms - Cutting Dash Exit",
    "5. 670ms - Razor Slash Flash & Recoil",
    "6. 850ms - Screen Blood Splatter Overlay",
    "7. 1060ms - Still Stance (Zero Shaking)",
    "8. 1240ms - Chiburui Arc Motion",
    "9. 1340ms - Blood Flick Droplets from Scythe",
    "10. 1750ms - Hip Sheathe Lock (*CLACK*)",
    "11. 1960ms - Target Buckle & Collapse",
    "12. 2060ms - K.O. Stamp Confirmed"
]

# Layout: 4 columns x 3 rows
cols = 4
rows = 3
card_w = 340
card_h = int(340 * (430 / 780)) # ~187px
gap_x = 16
gap_y = 36
margin = 20

total_w = margin * 2 + cols * card_w + (cols - 1) * gap_x
total_h = margin * 2 + rows * (card_h + gap_y)

sb_img = Image.new("RGBA", (total_w, total_h), (20, 16, 13, 255))
draw = ImageDraw.Draw(sb_img)

for i, (f_idx, lbl) in enumerate(zip(storyboard_indices, storyboard_labels)):
    col = i % cols
    row = i // cols
    x = margin + col * (card_w + gap_x)
    y = margin + row * (card_h + gap_y)

    frame = cropped_images[f_idx]
    resized_card = frame.resize((card_w, card_h), Image.Resampling.LANCZOS)
    sb_img.paste(resized_card, (x, y + 22))

    # Border around card
    draw.rectangle([x, y + 22, x + card_w, y + 22 + card_h], outline=(95, 75, 58, 255), width=2)
    # Label above card
    draw.text((x + 2, y + 4), lbl, fill=(245, 235, 220, 255))

sb_path = os.path.join(ARTIFACTS_DIR, "katana_execution_storyboard.png")
sb_img.save(sb_path, "PNG")
print(f"Generated 12-Frame Storyboard: {sb_path} ({os.path.getsize(sb_path)} bytes)")
