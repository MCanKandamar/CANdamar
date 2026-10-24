"""
Generate candamar.ico from the favicon design (dark rounded square, green "C",
grey "d"). Run once after changing the design and commit the .ico:

    pip install pillow
    python packaging/windows/make_icon.py

Uses the Consolas Bold font that ships with Windows.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT   = Path(__file__).with_name("candamar.ico")
FONT  = Path("C:/Windows/Fonts/consolab.ttf")
SIZES = [16, 24, 32, 48, 64, 128, 256]

BG    = (8, 10, 11, 255)      # --bg-base
GREEN = (0, 217, 126, 255)    # --accent-green
GREY  = (61, 69, 84, 255)     # --text-muted


def render(size: int) -> Image.Image:
    # Draw at 4x and downsample for smooth edges at small sizes
    s   = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 6 / 32), fill=BG)

    font = ImageFont.truetype(str(FONT), int(s * 0.62))
    c_box = d.textbbox((0, 0), "C", font=font)
    v_box = d.textbbox((0, 0), "d", font=font)
    c_w, v_w = c_box[2] - c_box[0], v_box[2] - v_box[0]
    gap = int(s * 0.02)
    x = (s - (c_w + gap + v_w)) // 2
    baseline = int(s * 0.80)
    d.text((x - c_box[0], baseline), "C", font=font, fill=GREEN, anchor="ls")
    d.text((x + c_w + gap - v_box[0], baseline), "d", font=font, fill=GREY, anchor="ls")
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    largest = render(SIZES[-1])
    largest.save(OUT, sizes=[(n, n) for n in SIZES], append_images=[render(n) for n in SIZES[:-1]])
    print(f"wrote {OUT}")
