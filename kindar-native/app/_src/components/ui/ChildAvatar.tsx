/**
 * ChildAvatar — avatar circular com fallback automatico para inicial.
 *
 * Por que existe: photo_url da crianca e armazenado como path do Supabase
 * Storage (ex: `{groupId}/_avatars/{childId}.jpg`). Precisa ser assinado
 * antes de chegar na <Image>. Quando isso falha (rede, expirou, RLS),
 * a Image renderizava um circulo vazio. Esse componente:
 *
 * 1. Tenta carregar a Image (se photoUrl truthy)
 * 2. Em onError, troca pra inicial colorida com background brand light
 * 3. photoUrl null/undefined -> direto pra inicial (mesmo path)
 *
 * Usar em todos os cards de crianca pra UX consistente e nunca-vazia.
 */
import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { colors, font } from '../../design-system/tokens';

interface Props {
  photoUrl: string | null | undefined;
  firstName: string;
  size?: number; // diametro em px (default 44)
  textSize?: number; // tamanho da inicial (default size/2.2)
}

export default function ChildAvatar({ photoUrl, firstName, size = 44, textSize }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = !!photoUrl && !errored;
  const initial = firstName?.charAt(0)?.toUpperCase() || '?';

  if (showImage) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text -- RN Image usa accessibilityLabel
      <Image
        source={{ uri: photoUrl as string }}
        accessibilityLabel={`Foto de ${firstName}`}
        onError={() => setErrored(true)}
        style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: colors.brandLight,
        }}
      />
    );
  }

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.brandLight,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{
        fontSize: textSize ?? Math.round(size / 2.2),
        fontWeight: font.weights.bold,
        color: colors.brand,
      }}>
        {initial}
      </Text>
    </View>
  );
}
