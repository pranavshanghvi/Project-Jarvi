import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassesPhoto, GlassesPhotoList, listGlassesPhotos } from '../glasses/glassesPhotos';

interface Props {
  onPhotoChosen: (photo: GlassesPhoto) => void;
  busyPhotoId: string | null;
}

export default function GlassesImportScreen({ onPhotoChosen, busyPhotoId }: Props) {
  const [list, setList] = useState<GlassesPhotoList | null>(null);

  useEffect(() => {
    listGlassesPhotos().then(setList);
  }, []);

  if (!list) return <ActivityIndicator style={styles.loading} />;

  if (list.permissionDenied) {
    return <Text style={styles.message}>Jarvi needs access to your photos to find pictures from your glasses. Turn it on in Settings, then come back.</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.message}>
        {list.source === 'glasses'
          ? 'Photos from your glasses, newest first. Tap a meal to log it.'
          : 'No glasses album found yet, so these are your newest photos. In the Meta AI app, turn on importing to Photos.'}
      </Text>
      {list.photos.length === 0 && <Text style={styles.message}>Nothing new to log.</Text>}
      <FlatList
        data={list.photos}
        numColumns={3}
        keyExtractor={(photo) => photo.id}
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => onPhotoChosen(item)} disabled={busyPhotoId !== null}>
            <Image source={{ uri: item.thumbnailUri }} style={styles.thumbnail} />
            {busyPhotoId === item.id && <ActivityIndicator style={styles.busy} color="#fff" />}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  loading: { marginTop: 40 },
  message: { fontSize: 13, color: '#555', padding: 4, marginBottom: 8 },
  cell: { width: '33.33%', aspectRatio: 1, padding: 2 },
  thumbnail: { flex: 1, borderRadius: 6, backgroundColor: '#eee' },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6, margin: 2 },
});
