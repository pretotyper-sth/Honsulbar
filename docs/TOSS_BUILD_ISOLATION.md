# 앱인토스와 AOS 배포 분리

2026-11-04 PortOne 포함 반려 대응.

## 원인

`7e0440d`에서 AOS 본인확인 테스트용 `public/age-verification.html`을 추가했습니다. Vite의 기본 public 복사 동작 때문에 페이지를 토스 UI에서 호출하지 않아도 `.ait` 안에 PortOne SDK 로더와 AOS 딥링크가 들어갔습니다. 같은 경로로 Android 전용 약관 9개도 포함됐습니다.

## 빌드 경계

- 웹/AOS 지원 배포: 기존 `npm run build` → `dist`. 공용 public 파일, AOS 인증 페이지와 Android 약관을 그대로 제공합니다.
- 앱인토스: `node scripts/toss-release.js --build-only` 또는 `npm run toss:release` → Vite `--mode toss` → `dist-toss` → `.ait`.
- 토스 빌드에서만 AOS 인증 페이지·Android 약관·숨김 파일을 제외하고 계정 연결 UI를 빈 구현으로 치환합니다. 공용 원본이나 AOS 서버 API는 삭제하지 않습니다.
- 토스 로그인, 토스 IAP, 토스 광고, 토스 알림, 얼굴 검사·음성 기능은 현재 구현을 유지합니다.
- `scripts/check-toss-bundle.js`는 압축된 `.ait`의 모든 파일을 읽어 금지된 SDK·AOS 페이지 포함 여부를 검사합니다. 빌드 후와 `--upload-only` 업로드 전 모두 실행합니다. 공식 토스 SDK 내부의 `AppsInTossAdmob` 브릿지는 외부 AdMob 직접 연동과 구분합니다.

## 재검증

```
npm test
npm run build
node scripts/toss-release.js --build-only
node scripts/check-toss-bundle.js honsulbar.ait
```

웹 빌드의 `/age-verification.html`, `/legal/android/*`는 유지돼야 하고 토스 `.ait`에는 없어야 합니다. 새 플랫폼 전용 정적 파일을 추가할 때 필터와 회귀검사를 함께 갱신합니다. SDK·결제 번들 혼입 해결이 만남 서비스 사전검수 승인이나 전체 심사 통과를 보장하지는 않습니다.
