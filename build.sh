mkdir -p build && cd build

# call "./build.sh prod" to disable debugging and debug macros in the code 
if [ "$1" = "prod" ] ; then
	cmake .. 
else
	cmake .. -DCMAKE_BUILD_TYPE=Debug

fi
cmake --build .

# quick reference example -- to add debug statements:
#ifdef ENG_DEBUG
    #std::cout << "debug is on! let's go\n";
#endif
