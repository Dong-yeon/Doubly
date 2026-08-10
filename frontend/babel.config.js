// react-native-reanimated(운동 세션 화면의 드래그 앤 드롭 순서 변경에 사용)는
// worklet 코드를 변환하는 babel 플러그인이 필요하다. 반드시 plugins 배열의 마지막에 둘 것.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
