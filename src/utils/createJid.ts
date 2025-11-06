// Check if the number is MX or AR
function formatMXOrARNumber(jid: string): string {
  const countryCode = jid.substring(0, 2);

  if (Number(countryCode) === 52 || Number(countryCode) === 54) {
    if (jid.length === 13) {
      const number = countryCode + jid.substring(3);
      return number;
    }

    return jid;
  }
  return jid;
}

// Check if the number is br
function formatBRNumber(jid: string) {
  // Aceita números com 13 dígitos (correto) ou 14 dígitos (com 9 duplicado)
  const regexp13 = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/); // 55 + 88 + 9 + 96894405 = 13 dígitos
  const regexp14 = new RegExp(/^(\d{2})(\d{2})(\d{2})(\d{8})$/); // 55 + 88 + 99 + 6894405 = 14 dígitos

  // Verifica se é número brasileiro (código 55)
  if (jid.startsWith('55')) {
    // Caso 1: 14 dígitos com 9 duplicado (ex: 5588996894405)
    if (jid.length === 14 && regexp14.test(jid)) {
      const match = regexp14.exec(jid);
      if (match) {
        const countryCode = match[1]; // 55
        const ddd = match[2]; // 88
        const ninthDigits = match[3]; // 99 (duplicado)
        const restNumber = match[4]; // 6894405

        // Remove o primeiro 9 se tiver dois 9s duplicados
        if (ninthDigits[0] === '9' && ninthDigits[1] === '9') {
          return countryCode + ddd + ninthDigits[1] + restNumber; // 55 + 88 + 9 + 6894405
        }

        // Se não for 99, tenta remover o primeiro dígito duplicado
        return countryCode + ddd + ninthDigits[1] + restNumber;
      }
    }

    // Caso 2: 13 dígitos (formato correto)
    if (jid.length === 13 && regexp13.test(jid)) {
      const match = regexp13.exec(jid);
      if (match) {
        const joker = Number.parseInt(match[3][0]);
        const ddd = Number.parseInt(match[2]);

        // Se o número começa com dígito < 7 OU DDD < 31, mantém o formato
        if (joker < 7 || ddd < 31) {
          return match[0];
        }

        // Remove o 9 se não for celular válido
        return match[1] + match[2] + match[3];
      }
    }

    // Caso 3: 12 dígitos (sem o 9)
    if (jid.length === 12) {
      return jid;
    }
  }

  return jid;
}

export function createJid(number: string): string {
  number = number.replace(/:\d+/, '');

  if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
    return number;
  }

  if (number.includes('@broadcast')) {
    return number;
  }

  number = number
    ?.replace(/\s/g, '')
    .replace(/\+/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .split(':')[0]
    .split('@')[0];

  if (number.includes('-') && number.length >= 24) {
    number = number.replace(/[^\d-]/g, '');
    return `${number}@g.us`;
  }

  number = number.replace(/\D/g, '');

  if (number.length >= 18) {
    number = number.replace(/[^\d-]/g, '');
    return `${number}@g.us`;
  }

  number = formatMXOrARNumber(number);

  number = formatBRNumber(number);

  return `${number}@s.whatsapp.net`;
}
