import os
from PIL import Image, ImageDraw, ImageFont

ARTIFACTS_DIR = r"C:\Users\Osama Yusouf\.gemini\antigravity\brain\f608478c-72b0-4894-8cae-93bb137c1243\screenshots"

frame_defs = [
    ("katana_1_focus_center.png", 550, "1. Target Locked & Drawn"),
    ("katana_2_lightning_dash.png", 400, "2. Lightning Katana Dash"),
    ("katana_3_razor_slash.png", 280, "3. Razor Slice Flash"),
    ("katana_4_blood_splash.png", 750, "4. Visceral Blood Splash"),
    ("katana_5_sheathe_knockout.png", 700, "5. Sheathe Snap & K.O.")
]

cropped_frames = []
durations = []

crop_box = (250, 195, 1030, 625)

for filename, dur, label in frame_defs:
    filepath = os.path.join(ARTIFACTS_DIR, filename)
    if os.path.exists(filepath):
        im = Image.open(filepath).convert("RGBA")
        crop = im.crop(crop_box)
        cropped_frames.append(crop)
        durations.append(dur)
    else:
        print(f"File missing: {filepath}")

if cropped_frames:
    # 1. Save Animated GIF
    gif_path = os.path.join(ARTIFACTS_DIR, "katana_execution_sequence.gif")
    p_frames = [f.convert("RGB").convert("P", palette=Image.Palette.ADAPTIVE) for f in cropped_frames]
    p_frames[0].save(
        gif_path,
        save_all=True,
        append_images=p_frames[1:],
        duration=durations,
        loop=0,
        optimize=True
    )
    print(f"Generated GIF: {gif_path} ({os.path.getsize(gif_path)} bytes)")

    # 2. Save Storyboard Image
    cell_w = 300
    cell_h = int(300 * (430 / 780)) # ~165px
    gap = 14
    margin = 16
    total_w = (cell_w * len(cropped_frames)) + (gap * (len(cropped_frames) - 1)) + (margin * 2)
    total_h = cell_h + 50 + (margin * 2)

    sb_img = Image.new("RGBA", (total_w, total_h), (21, 17, 14, 255))
    draw = ImageDraw.Draw(sb_img)

    for i, (f, (_, _, label)) in enumerate(zip(cropped_frames, frame_defs)):
        x = margin + i * (cell_w + gap)
        y = margin + 30
        resized_cell = f.resize((cell_w, cell_h), Image.Resampling.LANCZOS)
        sb_img.paste(resized_cell, (x, y))
        draw.rectangle([x, y, x + cell_w, y + cell_h], outline=(90, 72, 57, 255), width=2)
        draw.text((x + 4, margin + 8), label, fill=(245, 235, 220, 255))

    sb_path = os.path.join(ARTIFACTS_DIR, "katana_execution_storyboard.png")
    sb_img.save(sb_path, "PNG")
    print(f"Generated Storyboard: {sb_path} ({os.path.getsize(sb_path)} bytes)")

    # Clean up test file
    test_p = os.path.join(ARTIFACTS_DIR, "crop_test.png")
    if os.path.exists(test_p):
        os.remove(test_p)
