import { FlatList, StyleSheet, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { samplePosts } from '@/data/posts';
import { colors, space } from '@/theme/tokens';

export default function FeedScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Feed" subtitle="Nearby hunters and your groups" />
      <FlatList
        data={samplePosts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
