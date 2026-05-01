"""
App Store用スクリーンショット生成スクリプト
出力: 1320×2868 (6.9インチ) と 1290×2796 (6.7インチ)
"""
from PIL import Image, ImageDraw, ImageFont

BG_COLOR = (10, 10, 10)
PRIMARY  = (0, 230, 118)
WHITE    = (255, 255, 255)
GRAY     = (160, 160, 160)

FONT_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
FONT_REG  = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'

ASSETS = '/Users/yoshiirio/pitch-in/assets'

SIZES = [
    ('6.5', 1242, 2688),
    ('6.7', 1284, 2778),
]

SCREENS = [
    (
        'follow',
        '好きな選手を\nフォローしよう',
        '海外リーグで活躍する日本人選手を\n簡単に追いかけられる',
    ),
    (
        'matches',
        '試合情報を\nリアルタイムで確認',
        'フォロー選手の試合日程・スコア・\nスタメン情報をまとめてチェック',
    ),
    (
        'alarm',
        'アラームで\n試合を見逃さない',
        'スタメン発表時・試合開始前など\n好きなタイミングにセット',
    ),
    (
        'alarms',
        '設定したアラームを\nかんたん管理',
        'いつでも確認・編集・削除できる',
    ),
]


def draw_centered_text(draw, text, y, font, color, canvas_w):
    lines = text.split('\n')
    line_h = font.size + 14
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        draw.text(((canvas_w - w) // 2, y), line, font=font, fill=color)
        y += line_h
    return y


def composite_screenshot(ss_path, bg_color):
    """透過PNGをダーク背景に合成してRGBで返す"""
    ss = Image.open(ss_path).convert('RGBA')
    bg = Image.new('RGBA', ss.size, bg_color + (255,))
    merged = Image.alpha_composite(bg, ss)
    return merged.convert('RGB')


def make_screenshot(name, title, subtitle, canvas_w, canvas_h):
    canvas = Image.new('RGB', (canvas_w, canvas_h), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    # フォントサイズはキャンバス幅に比例してスケール
    scale = canvas_w / 1320
    f_label    = ImageFont.truetype(FONT_BOLD, int(34 * scale))
    f_title    = ImageFont.truetype(FONT_BOLD, int(76 * scale))
    f_subtitle = ImageFont.truetype(FONT_REG,  int(40 * scale))

    # アプリ名ラベル
    label = 'Pitch-In'
    bbox = draw.textbbox((0, 0), label, font=f_label)
    draw.text(((canvas_w - (bbox[2] - bbox[0])) // 2, int(88 * scale)),
              label, font=f_label, fill=PRIMARY)

    # タイトル
    after_title = draw_centered_text(
        draw, title, int(162 * scale), f_title, WHITE, canvas_w)

    # サブタイトル
    draw_centered_text(
        draw, subtitle, after_title + int(26 * scale), f_subtitle, GRAY, canvas_w)

    # スクリーンショット合成
    ss = composite_screenshot(f'{ASSETS}/{name}.png', BG_COLOR)

    # キャンバスの残り高さに合わせてスケール
    text_area_h = int(548 * scale)
    avail_h = canvas_h - text_area_h - int(40 * scale)  # 下に少し余白
    avail_w = int(canvas_w * 0.82)

    ratio_h = avail_h / ss.height
    ratio_w = avail_w / ss.width
    ratio = min(ratio_h, ratio_w)

    ss_w = int(ss.width * ratio)
    ss_h = int(ss.height * ratio)
    ss = ss.resize((ss_w, ss_h), Image.LANCZOS)

    x = (canvas_w - ss_w) // 2
    y = text_area_h
    canvas.paste(ss, (x, y))

    out = f'{ASSETS}/store_{name}_{canvas_w}x{canvas_h}.png'
    canvas.save(out, 'PNG')
    print(f'Saved: {out}')


if __name__ == '__main__':
    for size_label, cw, ch in SIZES:
        print(f'\n--- {size_label}インチ ({cw}×{ch}) ---')
        for name, title, subtitle in SCREENS:
            make_screenshot(name, title, subtitle, cw, ch)
    print('\nDone!')
