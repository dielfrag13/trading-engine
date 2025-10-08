mkdir -p build && cd build

# call "./build.sh release" to disable debugging and debug macros in the code 
if [ "$1" = "release" ] ; then
	cmake .. -DCMAKE_BUILD_TYPE=Release
else
	cmake .. -DCMAKE_BUILD_TYPE=Debug

fi
cmake --build .

# quick reference example -- to add debug statements in code:
#ifdef ENG_DEBUG
    #std::cout << "debug is on! let's go\n";
#endif
