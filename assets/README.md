# Assets Directory

이 폴더는 JUNO HAIR 예약 시스템의 정적 에셋을 저장합니다.

## 폴더 구조

```
assets/
├── images/     # 일반 이미지 파일들 (jpg, png, webp)
├── logos/      # 로고 파일들 (svg, png)
├── icons/      # 아이콘 파일들 (svg, ico)
└── README.md   # 이 파일
```

## 사용 예시

HTML에서 이미지 사용:
```html
<img src="/assets/logos/juno-hair-logo.svg" alt="JUNO HAIR">
<img src="/assets/icons/wave-emoji.svg" alt="👋">
```

CSS에서 배경 이미지 사용:
```css
background-image: url('/assets/images/background.jpg');
```

## 권장 파일 형식

- **로고**: SVG (벡터, 확대 시 깨지지 않음)
- **아이콘**: SVG 또는 PNG (24x24, 48x48)
- **이미지**: WebP > PNG > JPG (용량 최적화)
