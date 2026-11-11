import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { GlassesPhoto, GlassesPhotoList, listGlassesPhotos } from '../glasses/glassesPhotos';
import { Body, Header, Muted, Screen } from '../ui/kit';
import { colors } from '../ui/theme';

interface Props {
  onPhotoChosen: (photo: GlassesPhoto) => void;
  busyPhotoId: string | null;
  onBack: () => void;
}

export default function GlassesImportScreen({ onPhotoChosen, busyPhotoId, onBack }: Props) {
  const [list, setList] = useState<GlassesPhotoList | null>(null);

  useEffect(() => {
    listGlassesPhotos().then(setList);
  }, []);

  return (
    <Screen scroll={false}>
      <Header title="From your glasses" onBack={onBack} />
      {!list ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : list.permissionDenied ? (
        <Body>This app needs access to your photos to find pictures from your glasses. Turn it on in Settings, then come back.</Body>
      ) : (
        <>
          <Muted>
            {busyPhotoId
              ? 'Reading your photo… this takes about 20 seconds.'
              : list.source === 'glasses'
                ? 'Photos from your glasses, newest first. Tap a meal to log it.'
                : 'No glasses album found yet, so these are your newest photos. In the Meta AI app, turn on importing to Photos.'}
          </Muted>
          {list.photos.length === 0 && <Body>Nothing new to log.</Body>}
          <FlatList
            data={list.photos}
            numColumns={3}
            keyExtractor={(photo) => photo.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable style={styles.cell} onPress={() => onPhotoChosen(item)} disabled={busyPhotoId !== null} accessibilityRole="button" accessibilityLabel="Log this photo">
                <Image source={{ uri: item.thumbnailUri }} style={styles.thumbnail} />
                {busyPhotoId === item.id && (
                  <View style={styles.busy}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </Pressable>
            )}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.33%', aspectRatio: 1, padding: 3 },
  thumbnail: { flex: 1, borderRadius: 12, backgroundColor: colors.track },
  busy: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
