// Choosing pictures: from Photos, or from the Files app.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/** Picks pictures from Photos, at full quality and as they are (a PNG stays a PNG, keeping its see-through parts). */
export async function pickImages(multiple: boolean): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 0 : 1,
    // Full quality here; the cropper compresses once when it saves.
    quality: 1,
    // The picture as it is, not converted: a PNG stays a PNG, so its see-through parts can be kept.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

/** Picks images from the Files app (iCloud Drive and other storage apps), copied somewhere the app can read them. */
export async function pickFiles(multiple: boolean): Promise<string[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple, copyToCacheDirectory: true });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}
