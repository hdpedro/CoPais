import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import { uploadDocument, DOCUMENT_CATEGORIES, type UploadDocumentInput } from '../../services/documents';
import { useToast } from '../ui/ToastProvider';
import { useI18n } from '../../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  onUploaded: () => void;
  groupId: string;
  childId: string | null;
  uploadedBy: string;
}

interface PickedFile {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
}

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default function UploadSheet({ visible, onClose, onUploaded, groupId, childId, uploadedBy }: Props) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  // Android + Modal pageSheet: presentationStyle="pageSheet" só funciona
  // como sheet com top inset automático no iOS. No Android cai pra
  // fullscreen e a status bar fica SOBRE o header — relógio do sistema
  // sobrepõe "Cancelar" e ícones de status sobrepõem "Enviar".
  // Fix: aplicar insets.top manualmente no header (iOS já faz pelo
  // pageSheet visual, mas mantemos pra evitar branch — diff de poucos px
  // é imperceptível).
  const insets = useSafeAreaInsets();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [uploading, setUploading] = useState(false);

  function reset() {
    setFile(null);
    setName('');
    setCategory('other');
    setUploading(false);
  }

  async function pickFromCamera() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.show({ message: t('toasts.permissions.cameraBlocked'), variant: 'info' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      fileName: asset.fileName ?? `foto_${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? 0,
    });
    if (!name) setName(asset.fileName ?? `Foto ${new Date().toLocaleDateString('pt-BR')}`);
  }

  async function pickFromLibrary() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show({ message: t('toasts.permissions.photosBlocked'), variant: 'info' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      fileName: asset.fileName ?? `imagem_${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? 0,
    });
    if (!name) setName(asset.fileName?.replace(/\.[^.]+$/, '') ?? '');
  }

  async function pickFromFiles() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_MIME,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? 0,
    });
    if (!name) setName(asset.name.replace(/\.[^.]+$/, ''));
  }

  async function handleUpload() {
    if (!file) {
      toast.show({ message: t('toasts.validation.fillRequired'), variant: 'info' });
      return;
    }
    if (!name.trim()) {
      toast.show({ message: t('toasts.validation.nameRequired'), variant: 'error' });
      return;
    }

    setUploading(true);
    const input: UploadDocumentInput = {
      uri: file.uri,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
      groupId,
      childId,
      category,
      displayName: name.trim(),
      uploadedBy,
    };
    const res = await uploadDocument(input);
    setUploading(false);

    if (!res.success) {
      toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Bug Aline/Mauricio 2026-05-14: usuária reclamou que "envia mas não
    // fica salvo" — toast garante o feedback explícito de sucesso.
    reset();
    onClose();
    onUploaded();
    toast.show({ message: t('toasts.common.sent'), variant: 'success' });
  }

  function handleClose() {
    if (uploading) return;
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        {/* Sheet header — paddingTop dinâmico cobre status bar do Android
            (no iOS o pageSheet já dá o inset; aplicar +insets.top neutraliza
            sem efeito visual ruim porque iOS retorna insets.top relativo ao
            sheet, ~0 quando renderizado como page sheet). */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md + (Platform.OS === 'android' ? insets.top : 0),
            paddingBottom: spacing.md,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.borderLight,
            backgroundColor: colors.bgElevated,
          }}
        >
          <TouchableOpacity onPress={handleClose} disabled={uploading}>
            <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary }}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: font.sizes.md, fontWeight: '700', color: colors.text }}>
            Novo documento
          </Text>
          <TouchableOpacity onPress={handleUpload} disabled={uploading || !file || !name.trim()}>
            <Text
              style={{
                fontSize: font.sizes.md,
                fontWeight: '700',
                color: !file || !name.trim() ? colors.textMuted : colors.brand,
              }}
            >
              {uploading ? 'Enviando…' : 'Enviar'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          {/* File picker */}
          {!file ? (
            <View>
              <Text
                style={{
                  fontSize: font.sizes.xs,
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontWeight: '700',
                  marginBottom: spacing.sm,
                }}
              >
                De onde?
              </Text>
              <View style={{ gap: spacing.sm }}>
                <PickerOption icon="camera-outline" label="Tirar foto" hint="Documento, carteirinha…" onPress={pickFromCamera} />
                <PickerOption icon="image-outline" label="Da galeria" hint="JPG, PNG, HEIC" onPress={pickFromLibrary} />
                <PickerOption icon="document-attach-outline" label="Arquivo do dispositivo" hint="PDF ou Word, até 10MB" onPress={pickFromFiles} />
              </View>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: colors.bgElevated,
                borderRadius: radius.lg,
                padding: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.md,
                  backgroundColor: colors.brandLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={file.mimeType.startsWith('image/') ? 'image' : 'document-text'}
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                  {file.fileName}
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                  {file.size > 0 ? `${Math.round(file.size / 1024)} KB` : 'Tamanho desconhecido'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setFile(null)} disabled={uploading}>
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Name */}
          <View>
            <Text
              style={{
                fontSize: font.sizes.xs,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontWeight: '700',
                marginBottom: spacing.sm,
              }}
            >
              Nome do documento
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex: Carteirinha do plano de saúde"
              placeholderTextColor={colors.textMuted}
              editable={!uploading}
              style={{
                backgroundColor: colors.bgElevated,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                fontSize: font.sizes.md,
                color: colors.text,
              }}
            />
          </View>

          {/* Category */}
          <View>
            <Text
              style={{
                fontSize: font.sizes.xs,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontWeight: '700',
                marginBottom: spacing.sm,
              }}
            >
              Categoria
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {DOCUMENT_CATEGORIES.map((c) => {
                const isActive = category === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    disabled={uploading}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.full,
                      backgroundColor: isActive ? colors.brand : colors.bgElevated,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                    <Text
                      style={{
                        fontSize: font.sizes.sm,
                        color: isActive ? 'white' : colors.text,
                        fontWeight: '600',
                      }}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {uploading ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm }}>
                Enviando para o Kindar…
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PickerOption({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.lg,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.brandLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}
