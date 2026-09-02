import json

with open('.i18n-batches/vi.todo.json', 'r') as f:
    data = json.load(f)

# Find the empty string and fill it with the correct translation.
target_key = "With a transparent PNG of yourself, one decent photo becomes a full identity kit: a neutral studio-style backdrop for LinkedIn and your CV, your brand color for a website team page, something playful for Discord or X. Recruiters consistently respond better to clean, distraction-free headshots — and you get one without booking a studio."
target_val = "Dựa trên tấm ảnh PNG trong suốt của chính bạn, một bức hình tươm tất giờ đây hóa thành trọn bộ nhận diện: phần bối cảnh màu trung tính đậm chất studio thích hợp dành cho nền tảng LinkedIn cùng bản CV của bạn, mang theo tông màu biểu tượng của thương hiệu để đăng lên mục giới thiệu đội ngũ trên website, hay một cái gì đó thật thú vị để hiện diện trên Discord hoặc X (trước kia là Twitter). Thực tế cho thấy các nhà tuyển dụng luôn dành nhiều sự ưu ái hơn đối với những tấm ảnh chân dung rõ nét, không lẫn lộn chi tiết gây xao nhãng — và bạn hoàn toàn có thể sở hữu một bức như thế mà chẳng cần phải cất công liên hệ studio."

if target_key in data:
    data[target_key] = target_val

with open('.i18n-batches/vi.todo.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
