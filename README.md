# Ja tak – Generator (Backend til Vercel)

Serverless backend der genererer "ja tak"-tekster via OpenAI GPT-4.1.

## Endpoint
POST `/api/generate`

### Request (JSON)
```json
{
  "product": "Okseculotte",
  "price": "129,00",
  "unit": "/kg",
  "pickup_note": "fra onsdag kl 10 og senest torsdag",
  "extra_note": "Billedet viser Mathias med varen",
  "tones": ["Sjov","Lokal","Kød"],
  "emojis": true
}
