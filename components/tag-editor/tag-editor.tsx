import { forwardRef, useCallback, useState, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import EmojiPicker from 'rn-emoji-keyboard';
import { TAG_COLORS } from '@/lib/constants';
import { getTagDisplayName } from '@/lib/get-tag-display-name';
import type { Tag } from '@/types';

interface TagEditorProps {
  mapId: string;
  editingTag: Tag | null;
  onCreateTag: (input: {
    mapId: string;
    name: string;
    emoji: string;
    color: string;
  }) => void;
  onUpdateTag: (input: {
    tagId: string;
    mapId: string;
    name: string;
    emoji: string;
    color: string;
    default_key: string | null;
  }) => void;
  onDeleteTag: (input: { tagId: string; mapId: string }) => void;
  isPending: boolean;
}

export const TagEditor = forwardRef<BottomSheetModal, TagEditorProps>(
  function TagEditor(
    { mapId, editingTag, onCreateTag, onUpdateTag, onDeleteTag, isPending },
    ref
  ) {
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('\u{1F4CD}');
    const [color, setColor] = useState<string>(TAG_COLORS[0]);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const { t } = useTranslation();

    const isEditing = !!editingTag;

    // Reset form when editingTag changes
    useEffect(() => {
      if (editingTag) {
        setName(getTagDisplayName(editingTag));
        setEmoji(editingTag.emoji ?? '\u{1F4CD}');
        setColor(editingTag.color ?? TAG_COLORS[0]);
      } else {
        setName('');
        setEmoji('\u{1F4CD}');
        setColor(TAG_COLORS[0]);
      }
    }, [editingTag]);

    const handleSave = useCallback(() => {
      if (!name.trim()) return;

      if (isEditing && editingTag) {
        const nameChanged = name.trim() !== getTagDisplayName(editingTag);
        onUpdateTag({
          tagId: editingTag.id,
          mapId,
          name,
          emoji,
          color,
          default_key: nameChanged ? null : editingTag.default_key,
        });
      } else {
        onCreateTag({ mapId, name, emoji, color });
      }
    }, [name, emoji, color, mapId, isEditing, editingTag, onCreateTag, onUpdateTag]);

    const handleDelete = useCallback(() => {
      if (!editingTag) return;

      Alert.alert(
        t('tagEditor.deleteTagTitle'),
        t('tagEditor.deleteTagMessage', { tagName: getTagDisplayName(editingTag) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              onDeleteTag({ tagId: editingTag.id, mapId });
            },
          },
        ]
      );
    }, [editingTag, mapId, onDeleteTag, t]);

    return (
      <>
        <BottomSheetModal
          ref={ref}
          snapPoints={['55%']}
          backgroundStyle={{ backgroundColor: '#FFFFFF', borderRadius: 24 }}
          handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
        >
          <BottomSheetScrollView
            contentContainerStyle={{ padding: 20, paddingTop: 4 }}
          >
            {/* Header */}
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: '#111827',
                marginBottom: 20,
              }}
            >
              {isEditing ? t('tagEditor.editTagTitle') : t('tagEditor.newTagTitle')}
            </Text>

            {/* Emoji + Name row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 20,
                gap: 12,
              }}
            >
              <Pressable
                onPress={() => setEmojiPickerOpen(true)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#E5E7EB',
                }}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>

              <BottomSheetTextInput
                value={name}
                onChangeText={setName}
                placeholder={t('tagEditor.tagNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
                style={{
                  flex: 1,
                  backgroundColor: '#F3F4F6',
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: '#111827',
                }}
              />
            </View>

            {/* Color picker */}
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#6B7280',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('tagEditor.colorLabel')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 24,
              }}
            >
              {TAG_COLORS.map((c) => {
                const isSelected = color === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: c,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: isSelected ? 3 : 0,
                      borderColor: '#111827',
                    }}
                  >
                    {isSelected && (
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Action buttons */}
            <Pressable
              onPress={handleSave}
              disabled={!name.trim() || isPending}
              style={{
                backgroundColor: name.trim() ? '#3B82F6' : '#D1D5DB',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                marginBottom: isEditing ? 12 : 0,
              }}
            >
              <Text
                style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}
              >
                {isPending
                  ? t('tagEditor.saving')
                  : isEditing
                    ? t('tagEditor.saveChanges')
                    : t('tagEditor.createTag')}
              </Text>
            </Pressable>

            {isEditing && (
              <Pressable
                onPress={handleDelete}
                style={{
                  borderWidth: 1,
                  borderColor: '#FCA5A5',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{ color: '#DC2626', fontSize: 16, fontWeight: '600' }}
                >
                  {t('tagEditor.deleteTag')}
                </Text>
              </Pressable>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>

        <EmojiPicker
          onEmojiSelected={(emojiObj) => {
            setEmoji(emojiObj.emoji);
            setEmojiPickerOpen(false);
          }}
          open={emojiPickerOpen}
          onClose={() => setEmojiPickerOpen(false)}
        />
      </>
    );
  }
);
