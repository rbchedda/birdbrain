// Icon fonts load through expo-asset, which has no registry under Jest.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  Icon.glyphMap = {};
  return { Ionicons: Icon };
});
